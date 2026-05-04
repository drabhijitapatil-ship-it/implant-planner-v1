import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import BackButton from '../components/BackButton';

/**
 * iter-148: Standalone "Ask Implanr AI" chat — accessible without opening a
 * case. Lets clinicians browse the implant catalog conversationally with an
 * optional system-scope dropdown.
 */

type Msg = { role: 'user' | 'ai'; text: string; ts: number };

const SUGGESTED = [
  'Which systems support zirconia final abutments?',
  'Find me a 3.0 mm narrow-platform implant under 14 mm.',
  'Compare multi-unit abutment angulations across all systems.',
  'Which systems offer the best primary stability in soft (D4) bone?',
  'List all systems with Locator overdenture support.',
];

export default function AskImplanrAI() {
  const [systems, setSystems] = useState<{ key: string; brand: string; name: string }[]>([]);
  const [scopeKey, setScopeKey] = useState<string>('');  // '' = all populated systems
  const [scopeOpen, setScopeOpen] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/implant-catalog');
        const all = (res.data?.systems || []).filter((s: any) => !s.is_stub);
        setSystems(all.map((s: any) => ({ key: s.key, brand: s.brand, name: s.name })));
      } catch {}
    })();
  }, []);

  const scopeLabel = useMemo(() => {
    if (!scopeKey) return 'All systems';
    const m = systems.find(s => s.key === scopeKey);
    return m ? `${m.brand} ${m.name}` : scopeKey;
  }, [scopeKey, systems]);

  const send = useCallback(async (q?: string) => {
    const text = (q ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text, ts: Date.now() }]);
    setLoading(true);
    try {
      const res = await api.post('/ai/ask-implanr', {
        question: text,
        system_key: scopeKey || undefined,
      });
      const ans = res.data?.answer || 'No answer.';
      setMessages(prev => [...prev, { role: 'ai', text: ans, ts: Date.now() }]);
    } catch (e: any) {
      const err = e?.response?.data?.detail || e?.message || 'Request failed';
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err}`, ts: Date.now() }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [input, scopeKey, loading]);

  const groupedScope = useMemo(() => {
    const byBrand = new Map<string, { key: string; brand: string; name: string }[]>();
    for (const s of systems) {
      if (!byBrand.has(s.brand)) byBrand.set(s.brand, []);
      byBrand.get(s.brand)!.push(s);
    }
    return Array.from(byBrand.entries()).map(([brand, items]) => ({ brand, items }))
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [systems]);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.headerBar}>
        <BackButton />
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Ask Implanr AI</Text>
          <Text style={s.headerSub}>Catalog-grounded clinical assistant</Text>
        </View>
      </View>

      {/* Scope selector */}
      <TouchableOpacity
        style={s.scopeBar}
        onPress={() => setScopeOpen(true)}
        data-testid="ai-scope-selector"
      >
        <Ionicons name="filter" size={14} color="#0277BD" />
        <Text style={s.scopeText}>Scope: <Text style={s.scopeValue}>{scopeLabel}</Text></Text>
        <Ionicons name="chevron-down" size={14} color="#0277BD" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.chatBody}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={s.welcomeCard}>
              <Ionicons name="sparkles" size={28} color="#0277BD" />
              <Text style={s.welcomeTitle}>Ask anything about your implant catalog</Text>
              <Text style={s.welcomeSub}>
                Catalog-grounded answers — Implanr AI quotes only values from the {systems.length} populated systems.
              </Text>
              <Text style={s.suggestedHeader}>Try one of these:</Text>
              {SUGGESTED.map((q, i) => (
                <TouchableOpacity
                  key={i}
                  style={s.suggestedChip}
                  onPress={() => send(q)}
                  data-testid={`ai-suggestion-${i}`}
                >
                  <Ionicons name="bulb-outline" size={14} color="#0277BD" />
                  <Text style={s.suggestedText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            messages.map((m, i) => (
              <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAi]}>
                <Text style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.text}</Text>
              </View>
            ))
          )}
          {loading && (
            <View style={[s.bubble, s.bubbleAi]}>
              <ActivityIndicator size="small" color="#0277BD" />
            </View>
          )}
        </ScrollView>

        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about components, angulations, SKUs…"
            placeholderTextColor="#aaa"
            multiline
            data-testid="ai-input"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
            data-testid="ai-send"
          >
            <Ionicons name="send" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Scope picker modal */}
      <Modal visible={scopeOpen} transparent animationType="slide" onRequestClose={() => setScopeOpen(false)}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setScopeOpen(false)}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select Scope</Text>
              <TouchableOpacity onPress={() => setScopeOpen(false)}>
                <Ionicons name="close" size={22} color="#607D8B" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ brand: 'Any', items: [{ key: '', brand: 'Any', name: 'All populated systems' }] }, ...groupedScope]}
              keyExtractor={(item) => item.brand}
              renderItem={({ item }) => (
                <View>
                  <Text style={s.scopeBrandHeader}>{item.brand}</Text>
                  {item.items.map(sys => (
                    <TouchableOpacity
                      key={sys.key || 'all'}
                      style={[s.scopeRow, scopeKey === sys.key && s.scopeRowActive]}
                      onPress={() => { setScopeKey(sys.key); setScopeOpen(false); }}
                      data-testid={`ai-scope-${sys.key || 'all'}`}
                    >
                      <Text style={[s.scopeRowText, scopeKey === sys.key && s.scopeRowTextActive]}>
                        {sys.name}
                      </Text>
                      {scopeKey === sys.key && <Ionicons name="checkmark-circle" size={18} color="#0277BD" />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#01579B' },
  headerSub: { fontSize: 12, color: '#607D8B', marginTop: 2 },
  scopeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#E1F5FE', borderBottomWidth: 1, borderBottomColor: '#B3E5FC' },
  scopeText: { flex: 1, fontSize: 13, color: '#01579B' },
  scopeValue: { fontWeight: '700' },
  chatBody: { padding: 16, gap: 10 },
  welcomeCard: { alignItems: 'center', paddingVertical: 24 },
  welcomeTitle: { fontSize: 18, fontWeight: '700', color: '#01579B', marginTop: 12, textAlign: 'center' },
  welcomeSub: { fontSize: 13, color: '#607D8B', marginTop: 6, textAlign: 'center', maxWidth: 320 },
  suggestedHeader: { fontSize: 12, fontWeight: '700', color: '#0277BD', marginTop: 24, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  suggestedChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderColor: '#B3E5FC', borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, alignSelf: 'stretch' },
  suggestedText: { flex: 1, fontSize: 13, color: '#01579B', fontWeight: '500' },
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#0277BD' },
  bubbleAi: { alignSelf: 'flex-start', backgroundColor: '#FFF', borderColor: '#ECEFF1', borderWidth: 1 },
  bubbleText: { fontSize: 14, color: '#263238', lineHeight: 20 },
  bubbleTextUser: { color: '#FFF' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#ECEFF1' },
  input: { flex: 1, backgroundColor: '#F5F7FA', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#263238', maxHeight: 100 },
  sendBtn: { backgroundColor: '#0277BD', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  // Scope modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#ECEFF1' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#01579B' },
  scopeBrandHeader: { fontSize: 11, fontWeight: '700', color: '#607D8B', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  scopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F4F8' },
  scopeRowActive: { backgroundColor: '#E1F5FE' },
  scopeRowText: { fontSize: 14, color: '#263238' },
  scopeRowTextActive: { color: '#0277BD', fontWeight: '700' },
});
