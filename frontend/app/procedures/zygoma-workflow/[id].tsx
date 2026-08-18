/**
 * /procedures/zygoma-workflow/[id].tsx — iter-Feb-2026 (v4)
 * ------------------------------------------------------------------------
 * Host screen for the Zygoma & Pterygoid Extended Workflow (Phases 2-5).
 * Fetches the case, checks that it IS a Zygoma/Pterygoid procedure type,
 * hydrates the ZygomaExtendedWorkflow component with existing
 * `zygoma_pterygoid_data` and `zygoma_pterygoid_cosigns`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, SafeAreaView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import ZygomaExtendedWorkflow from '../../../components/ZygomaExtendedWorkflow';

const ZYGOMA_PT_TYPES = new Set([
  'Quad Zygoma Implants',
  'Zygoma and Pterygoid Implants',
  'Pterygoid and Conventional Implants',
  'Zygoma and Conventional Implants',
  'Zygoma, Pterygoid and Conventional Implants',
]);

export default function ZygomaWorkflowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [proc, setProc] = useState<any>(null);
  const [cosigns, setCosigns] = useState<any>(null);

  const load = useCallback(async () => {
    if (!id) { setError('Missing case ID in URL'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [pRes, cRes] = await Promise.all([
        api.get(`/procedures/${id}`),
        api.get(`/procedures/${id}/zygoma-cosigns`).catch(() => ({ data: {} })),
      ]);
      const p = pRes.data;
      if (!ZYGOMA_PT_TYPES.has(p.implant_procedure_type)) {
        setError(`This case is not a Zygoma/Pterygoid case (type: "${p?.implant_procedure_type || 'unknown'}"). The extended workflow is unavailable.`);
      } else {
        setProc(p);
        setCosigns(cRes.data);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Failed to load procedure.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isPterygoidLite = proc?.implant_procedure_type === 'Pterygoid and Conventional Implants';

  if (loading) {
    return (
      <SafeAreaView style={s.wrap}>
        <View style={s.center}><ActivityIndicator size="large" color="#5E35B1" /><Text style={s.loadingText}>Loading Zygoma workflow…</Text></View>
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={s.wrap}>
        <Stack.Screen options={{ title: 'Zygoma Workflow' }} />
        <View style={s.center}>
          <Ionicons name="alert-circle" size={48} color="#C62828" />
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={s.wrap}>
      <Stack.Screen options={{ title: 'Zygoma / Pterygoid Workflow' }} />
      <ZygomaExtendedWorkflow
        procedureId={id!}
        procedureType={proc?.implant_procedure_type || ''}
        isPterygoidLite={isPterygoidLite}
        initialData={proc?.zygoma_pterygoid_data || {}}
        cosigns={cosigns}
        onSaved={load}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F5F7FA' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#5E35B1', fontSize: 14 },
  errorText: { marginTop: 12, color: '#C62828', textAlign: 'center', fontSize: 14, lineHeight: 20 },
  backBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#5E35B1', borderRadius: 8 },
  backBtnText: { color: '#fff', fontWeight: '700' },
});
