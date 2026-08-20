/**
 * PhaseTabbedAutoFetch.tsx — iter-Jun-2026 (v10, Chunk 3)
 *
 * Thin wrapper around PhaseStep2TabbedView that self-fetches implant plans +
 * prior per-implant/advanced-clinical data given only the phase number and
 * procedure id. Lets Phase 2/3/4/5 screens embed the tabbed view with a
 * one-line JSX call.
 */
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import api, { getToken } from '../utils/api';
import PhaseStep2TabbedView, { PhaseNum } from './PhaseStep2TabbedView';

interface Props {
  phase: PhaseNum;
  procedureId: string;
  readOnly?: boolean;
}

const PhaseTabbedAutoFetch: React.FC<Props> = ({ phase, procedureId, readOnly }) => {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string>('');
  const [plans, setPlans] = useState<any[]>([]);
  const [perImplant, setPerImplant] = useState<Record<string, any>>({});
  const [advanced, setAdvanced] = useState<Record<string, any>>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [t, planRes, procRes] = await Promise.all([
          getToken('access_token'),
          api.get(`/procedures/${procedureId}/implant-plan`),
          api.get(`/procedures/${procedureId}`),
        ]);
        if (cancelled) return;
        setToken(t || '');
        setPlans(planRes.data.implant_plans || []);
        const pd = (procRes.data[`phase${phase}_data`] || {}) as any;
        setPerImplant(pd.per_implant || {});
        setAdvanced(pd.advanced_clinical || {});
      } catch {
        // Non-fatal — tabbed view will just show empty state.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [procedureId, phase, reloadKey]);

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="small" color="#5E35B1" />
        <Text style={s.loadingText}>Loading tabbed view…</Text>
      </View>
    );
  }

  return (
    <PhaseStep2TabbedView
      phase={phase}
      procedureId={procedureId}
      token={token}
      implantPlans={plans}
      initialPerImplant={perImplant}
      initialAdvancedClinical={advanced}
      readOnly={readOnly}
      onSaved={() => setReloadKey(k => k + 1)}
    />
  );
};

const s = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  loadingText: { fontSize: 12, color: '#78909C' },
});

export default PhaseTabbedAutoFetch;
