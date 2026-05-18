/**
 * Ask Implanr AI — floating round button + chat sheet (iter-242).
 *
 * Drops onto any screen. Renders a bottom-right FAB; tap to open a modal
 * containing a simple chat UI. Each message is POSTed to /api/ai/assistant
 * which is role-aware, tokenises patient names server-side, and logs every
 * query to access_logs for HIPAA.
 *
 * Usage:
 *   import AskImplanrAIFab from '@/components/AskImplanrAIFab';
 *   …in your screen JSX:
 *   <AskImplanrAIFab />
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

export default function AskImplanrAIFab() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMsg[]>([{
    role: 'assistant',
    content: "Hi! I'm Implanr AI — your personal assistant. Ask me about the app, your cases, implant systems, or anything else you'd like help navigating. What can I do for you?",
  }]);
  const sessionRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Gentle pulse on the FAB itself to draw attention the first time.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 1100, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user' as const, content: q }];
    setMsgs(next);
    setBusy(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      // iter-243: AI calls can take 10-20s on GPT-4o-mini, give axios a
      // generous timeout so we don't trip the default 10s/30s window and
      // surface 502/520 errors that look like server problems.
      const res = await api.post('/ai/assistant', {
        question: q,
        history: msgs.slice(-6),
        session_id: sessionRef.current,
      }, { timeout: 35000 });
      const data = res.data || {};
      sessionRef.current = data.session_id || sessionRef.current;
      setMsgs(m => [...m, { role: 'assistant', content: data.answer || '(empty response)' }]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || 'something went wrong';
      setMsgs(m => [...m, { role: 'assistant', content: `Sorry — ${msg}.` }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <>
      {/* Floating round button */}
      <Animated.View style={[styles.fab, { transform: [{ scale: pulse }] }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={() => setOpen(true)}
          testID="ask-implanr-fab"
          accessibilityRole="button"
          accessibilityLabel="Ask Implanr AI"
        >
          <Ionicons name="sparkles" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>

      {/* Chat sheet */}
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.backdrop}
        >
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.headerIcon}>
                  <Ionicons name="sparkles" size={18} color="#1565C0" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Ask Implanr AI</Text>
                  <Text style={styles.headerSub}>Your personal assistant</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} testID="ask-implanr-close" hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <Ionicons name="close" size={24} color="#37474F" />
              </TouchableOpacity>
            </View>

            <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={{ paddingVertical: 12 }}>
              {msgs.map((m, i) => (
                <View key={i} style={[styles.msgRow, m.role === 'user' && { justifyContent: 'flex-end' }]}>
                  <View style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAi]}>
                    <Text style={[styles.bubbleText, m.role === 'user' && { color: '#FFFFFF' }]}>{m.content}</Text>
                  </View>
                </View>
              ))}
              {busy && (
                <View style={styles.msgRow}>
                  <View style={[styles.bubble, styles.bubbleAi, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <ActivityIndicator size="small" color="#1565C0" />
                    <Text style={styles.bubbleText}>Thinking…</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="Ask anything about the app, your cases, or implants…"
                placeholderTextColor="#90A4AE"
                multiline
                onSubmitEditing={send}
                testID="ask-implanr-input"
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || busy) && { opacity: 0.4 }]}
                onPress={send}
                disabled={!input.trim() || busy}
                testID="ask-implanr-send"
              >
                <Ionicons name="arrow-up-circle" size={32} color="#1565C0" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', bottom: 92, right: 18, zIndex: 9999 },
  fabBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E3F2FD' },
  headerIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F2740' },
  headerSub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  messages: { flex: 1, paddingHorizontal: 14 },
  msgRow: { flexDirection: 'row', marginVertical: 5 },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  bubbleAi: { backgroundColor: '#F1F5F9', borderTopLeftRadius: 4 },
  bubbleUser: { backgroundColor: '#1565C0', borderTopRightRadius: 4 },
  bubbleText: { fontSize: 14, color: '#1A1A2E', lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#E3F2FD', backgroundColor: '#FAFAFA' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#CFD8DC', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#1A1A2E' },
  sendBtn: { padding: 4 },
});
