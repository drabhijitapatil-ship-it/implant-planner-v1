/**
 * iter-341: Implant Survival Review — Phase 2 → Phase 3 gating step
 *
 * Flow (per user pick 3b):
 *   1. Single Yes/No: "All Implants Survived" (or "Implant Survived" for 1)
 *   2. If Yes -> mark all Active, proceed to Phase 3
 *   3. If No  -> per-implant card: reason, removed, replaced (+ system/D/L)
 *   4. Submit -> POST /api/procedures/{id}/survival-review
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';

const REASONS = [
  'Early failure', 'Lack of Osseointegration', 'Infection', 'Peri-implantitis',
  'Mobility', 'Implant fracture', 'Unknown', 'Removed elsewhere', 'Other',
];

type FailureEntry = {
  implant_idx: number;
  tooth: string | number;
  reason: string;
  removed: boolean;
  replaced: boolean;
  replacement: { system: string; diameter: string; length: string };
};

export default function SurvivalReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [implants, setImplants] = useState<any[]>([]);
  const [allSurvived, setAllSurvived] = useState<'yes' | 'no' | null>(null);
  const [failures, setFailures] = useState<Record<number, FailureEntry>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/procedures/${id}/active-implants`);
        setImplants(res.data?.active || []);
      } catch (e: any) {
        Alert.alert('Error', e?.response?.data?.detail || 'Failed to load implants');
      } finally { setLoading(false); }
    })();
  }, [id]);

  const toggleFailure = (idx: number, imp: any, survived: 'yes' | 'no') => {
    if (survived === 'yes') {
      const cp = { ...failures }; delete cp[idx]; setFailures(cp);
    } else {
      setFailures(prev => ({
        ...prev,
        [idx]: prev[idx] || {
          implant_idx: idx, tooth: imp.tooth_number || imp.tooth || '',
          reason: 'Unknown', removed: true, replaced: false,
          replacement: { system: '', diameter: '', length: '' },
        },
      }));
    }
  };

  const setField = (idx: number, key: keyof FailureEntry, value: any) => {
    setFailures(prev => ({ ...prev, [idx]: { ...prev[idx], [key]: value } }));
  };
  const setReplField = (idx: number, key: 'system' | 'diameter' | 'length', value: string) => {
    setFailures(prev => ({
      ...prev,
      [idx]: { ...prev[idx], replacement: { ...prev[idx].replacement, [key]: value } },
    }));
  };

  const canSubmit = () => {
    if (allSurvived === 'yes') return true;
    if (allSurvived === 'no' && Object.keys(failures).length === 0) return false;
    // Every failure needs a reason. If replaced, replacement fields required.
    for (const f of Object.values(failures)) {
      if (!f.reason) return false;
      if (f.replaced) {
        if (!f.replacement.system || !f.replacement.diameter || !f.replacement.length) return false;
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!canSubmit()) { Alert.alert('Incomplete', 'Please fill all failure details.'); return; }
    setSaving(true);
    try {
      const body: any = { all_survived: allSurvived === 'yes', failures: [] };
      if (allSurvived === 'no') {
        body.failures = Object.values(failures).map(f => ({
          implant_idx: f.implant_idx,
          tooth: f.tooth,
          reason: f.reason,
          removed: f.removed,
          replaced: f.replaced,
          replacement: f.replaced ? {
            system: f.replacement.system,
            diameter: Number(f.replacement.diameter),
            length: Number(f.replacement.length),
          } : null,
        }));
      }
      await api.post(`/procedures/${id}/survival-review`, body);
      Alert.alert('Saved', 'Survival review recorded.',
        [{ text: 'Continue to Phase 3', onPress: () => router.replace(`/procedures/submit-stage2-surgical/${id}`) }]);
    } catch (e: any) {
      Alert.alert('Save failed', e?.response?.data?.detail || 'Please try again');
    } finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={s.c}><ActivityIndicator size="large" color="#1565C0" style={{marginTop:60}}/></SafeAreaView>;

  const label = implants.length === 1 ? 'Implant Survived' : 'All Implants Survived';

  return (
    <SafeAreaView style={s.c} edges={['top','bottom']}>
      <View style={s.h}>
        <TouchableOpacity onPress={() => router.back()} style={{padding:8}}><Ionicons name="arrow-back" size={22} color="#1565C0"/></TouchableOpacity>
        <View style={{flex:1,marginLeft:8}}>
          <Text style={s.title}>Implant Survival Review</Text>
          <Text style={s.sub}>Between Phase 2 and Phase 3</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}}>
        <View style={s.card}>
          <Text style={s.q}>{label}?</Text>
          <View style={{flexDirection:'row',gap:12,marginTop:12}}>
            <TouchableOpacity style={[s.pill, allSurvived === 'yes' && s.pillOn]} onPress={() => setAllSurvived('yes')} data-testid="survival-all-yes"><Text style={[s.pillT, allSurvived === 'yes' && s.pillTOn]}>Yes</Text></TouchableOpacity>
            <TouchableOpacity style={[s.pill, allSurvived === 'no' && s.pillOn]} onPress={() => setAllSurvived('no')} data-testid="survival-all-no"><Text style={[s.pillT, allSurvived === 'no' && s.pillTOn]}>No</Text></TouchableOpacity>
          </View>
        </View>

        {allSurvived === 'no' && implants.map((imp: any, i: number) => {
          const f = failures[i];
          const failed = !!f;
          return (
            <View key={i} style={s.card}>
              <Text style={s.itH}>Implant {i + 1} · Tooth {imp.tooth_number || imp.tooth || '-'}</Text>
              <Text style={s.itSub}>{imp.system || ''}  {imp.diameter}×{imp.length}mm</Text>
              <View style={{flexDirection:'row',gap:12,marginTop:12}}>
                <TouchableOpacity style={[s.pillSm, !failed && s.pillOn]} onPress={() => toggleFailure(i, imp, 'yes')} data-testid={`imp-${i}-survived-yes`}><Text style={[s.pillTSm, !failed && s.pillTOn]}>Survived</Text></TouchableOpacity>
                <TouchableOpacity style={[s.pillSm, failed && s.pillOnR]} onPress={() => toggleFailure(i, imp, 'no')} data-testid={`imp-${i}-survived-no`}><Text style={[s.pillTSm, failed && s.pillTOn]}>Failed</Text></TouchableOpacity>
              </View>
              {failed && (
                <View style={{marginTop:14,gap:10}}>
                  <Text style={s.lbl}>Reason for failure</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>
                    {REASONS.map(r => (
                      <TouchableOpacity key={r} style={[s.chip, f.reason === r && s.chipOn]} onPress={() => setField(i, 'reason', r)} data-testid={`imp-${i}-reason-${r.replace(/\s+/g,'-')}`}>
                        <Text style={[s.chipT, f.reason === r && s.chipTOn]}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={{flexDirection:'row',alignItems:'center',gap:12,marginTop:6}}>
                    <Text style={s.lbl}>Was it removed?</Text>
                    <TouchableOpacity style={[s.pillTiny, f.removed && s.pillOn]} onPress={() => setField(i, 'removed', true)}><Text style={[s.pillTT, f.removed && s.pillTOn]}>Yes</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.pillTiny, !f.removed && s.pillOn]} onPress={() => setField(i, 'removed', false)}><Text style={[s.pillTT, !f.removed && s.pillTOn]}>No</Text></TouchableOpacity>
                  </View>
                  <View style={{flexDirection:'row',alignItems:'center',gap:12,marginTop:6}}>
                    <Text style={s.lbl}>Was it replaced?</Text>
                    <TouchableOpacity style={[s.pillTiny, f.replaced && s.pillOn]} onPress={() => setField(i, 'replaced', true)} data-testid={`imp-${i}-replaced-yes`}><Text style={[s.pillTT, f.replaced && s.pillTOn]}>Yes</Text></TouchableOpacity>
                    <TouchableOpacity style={[s.pillTiny, !f.replaced && s.pillOn]} onPress={() => setField(i, 'replaced', false)} data-testid={`imp-${i}-replaced-no`}><Text style={[s.pillTT, !f.replaced && s.pillTOn]}>No</Text></TouchableOpacity>
                  </View>
                  {f.replaced && (
                    <View style={{marginTop:12,gap:8,padding:12,backgroundColor:'#F1F8E9',borderRadius:10,borderWidth:1,borderColor:'#C5E1A5'}}>
                      <Text style={[s.lbl,{fontWeight:'700',color:'#2E7D32'}]}>Replacement implant</Text>
                      <TextInput style={s.input} placeholder="System (e.g. Straumann BLT)" value={f.replacement.system} onChangeText={v => setReplField(i, 'system', v)} data-testid={`imp-${i}-repl-system`} />
                      <View style={{flexDirection:'row',gap:8}}>
                        <TextInput style={[s.input,{flex:1}]} placeholder="Diameter (mm)" keyboardType="decimal-pad" value={f.replacement.diameter} onChangeText={v => setReplField(i, 'diameter', v)} data-testid={`imp-${i}-repl-diameter`} />
                        <TextInput style={[s.input,{flex:1}]} placeholder="Length (mm)" keyboardType="decimal-pad" value={f.replacement.length} onChangeText={v => setReplField(i, 'length', v)} data-testid={`imp-${i}-repl-length`} />
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {allSurvived && (
          <TouchableOpacity style={[s.submit, (!canSubmit() || saving) && {opacity:0.5}]} disabled={!canSubmit() || saving} onPress={handleSubmit} data-testid="survival-submit">
            {saving ? <ActivityIndicator color="#fff"/> : <><Ionicons name="checkmark-done" size={18} color="#fff"/><Text style={s.submitT}>Submit &amp; continue to Phase 3</Text></>}
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#F5F7FA' },
  h: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E0E6EF' },
  title: { fontSize: 16, fontWeight: '800', color: '#1A237E' },
  sub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E6EF' },
  q: { fontSize: 16, fontWeight: '700', color: '#0D47A1' },
  itH: { fontSize: 14, fontWeight: '800', color: '#1A1A2E' },
  itSub: { fontSize: 12, color: '#546E7A', marginTop: 2 },
  lbl: { fontSize: 12, fontWeight: '600', color: '#37474F' },
  pill: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC', flex: 1, alignItems: 'center' },
  pillSm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC', flex: 1, alignItems: 'center' },
  pillTiny: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: '#CFD8DC' },
  pillOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  pillOnR: { backgroundColor: '#C62828', borderColor: '#C62828' },
  pillT: { fontSize: 14, fontWeight: '700', color: '#37474F' },
  pillTSm: { fontSize: 13, fontWeight: '700', color: '#37474F' },
  pillTT: { fontSize: 12, fontWeight: '600', color: '#37474F' },
  pillTOn: { color: '#FFF' },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FAFAFA' },
  chipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipT: { fontSize: 12, color: '#37474F', fontWeight: '600' },
  chipTOn: { color: '#FFF' },
  input: { borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 8, padding: 10, fontSize: 13, color: '#1e2a44', backgroundColor: '#FFF' },
  submit: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1565C0', borderRadius: 12, paddingVertical: 14 },
  submitT: { color: '#FFF', fontWeight: '800', fontSize: 14 },
});
