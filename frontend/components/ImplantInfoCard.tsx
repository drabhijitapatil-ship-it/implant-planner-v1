/**
 * Implant Information Card (IIC) — issued on treatment completion.
 * Two-sided card: P (Patient) and I (Implant). Download / share as a
 * credit-card-size PDF; supervisors / In-charge / Admin can re-issue.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Share } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import api, { getToken } from '../utils/api';
import { BACKEND_URL } from '../utils/config';

type Implant = { site: string; company: string; dimensions: string; model: string; lot: string; serial: string };
type Card = {
  card_number: string;
  issued_at: string;
  reissued_at?: string | null;
  revision: number;
  institution: string;
  patient: { name: string; age_sex: string; implant_count: number; locations: string; placement_date: string; final_prosthesis_date: string };
  implant: { prosthesis_type: string; implants: Implant[] };
  warnings: string[];
  can_reissue: boolean;
};

const NR = 'Not recorded';
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function ImplantInfoCard({ procedureId }: { procedureId: string }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<'P' | 'I'>('P');
  const [busy, setBusy] = useState<'pdf' | 'reissue' | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/procedures/${procedureId}/implant-card`);
      setCard(data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load the Implant Information Card');
    }
  }, [procedureId]);

  useEffect(() => { load(); }, [load]);

  const downloadPdf = async () => {
    if (!card) return;
    setBusy('pdf');
    try {
      const url = `${BACKEND_URL}/api/procedures/${procedureId}/implant-card/pdf`;
      const token = (await getToken('access_token')) || '';
      if (Platform.OS === 'web') {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error('Download failed');
        const blobUrl = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${card.card_number}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      } else {
        const dest = `${FileSystem.cacheDirectory}${card.card_number}.pdf`;
        const r = await FileSystem.downloadAsync(url, dest, { headers: { Authorization: `Bearer ${token}` } });
        if (r.status !== 200) throw new Error('Download failed');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(r.uri, { mimeType: 'application/pdf', dialogTitle: 'Share Implant Information Card' });
        } else {
          await Share.share({ url: r.uri });
        }
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Could not download the card');
    } finally {
      setBusy(null);
    }
  };

  const doReissue = async () => {
    setBusy('reissue');
    try {
      const { data } = await api.post(`/procedures/${procedureId}/implant-card/reissue`);
      setCard(data);
    } catch (e: any) {
      Alert.alert('Re-issue failed', e?.response?.data?.detail || 'Please try again');
    } finally {
      setBusy(null);
    }
  };

  const confirmReissue = () => {
    const msg = 'Re-issue the card with the latest case details? The card number stays the same and the issue date is updated.';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doReissue();
    } else {
      Alert.alert('Re-issue card', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Re-issue', onPress: doReissue }]);
    }
  };

  if (error) {
    return (
      <View style={styles.wrap} testID="iic-error">
        <Text style={styles.title}>Implant Information Card (IIC)</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={load} style={styles.retry} testID="iic-retry-btn"><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
      </View>
    );
  }
  if (!card) {
    return <View style={styles.wrap}><ActivityIndicator color="#0D47A1" /></View>;
  }

  const p = card.patient;
  const issued = fmt(card.reissued_at || card.issued_at) + (card.revision > 1 ? ` (rev ${card.revision})` : '');

  return (
    <View style={styles.wrap} testID="iic-section">
      <View style={styles.titleRow}>
        <Ionicons name="card-outline" size={20} color="#0D47A1" />
        <Text style={styles.title}>Implant Information Card (IIC)</Text>
      </View>
      <Text style={styles.subtitle}>Issued to the patient for this treatment. They can show it to any dental or medical professional.</Text>

      <View style={styles.toggle}>
        {(['P', 'I'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.toggleBtn, side === s && styles.toggleBtnActive]}
            onPress={() => setSide(s)}
            testID={`iic-side-${s}`}
          >
            <Text style={[styles.toggleText, side === s && styles.toggleTextActive]}>
              {s === 'P' ? 'P · Patient' : 'I · Implant'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.card} testID={`iic-card-${side}`}>
        <View style={styles.band}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inst} numberOfLines={1}>{card.institution}</Text>
            <Text style={styles.bandSub}>IMPLANT INFORMATION CARD (IIC)</Text>
          </View>
          <View style={styles.badge}><Text style={styles.badgeText}>{side}</Text></View>
        </View>

        {side === 'P' ? (
          <View style={styles.body}>
            <Field label="Patient Name" value={p.name} />
            <Field label="Age and Sex" value={p.age_sex} />
            <Field label="No. of Implants & Location (FDI)" value={`${p.implant_count}  ·  ${p.locations}`} />
            <Field label="Date of Implant Placement" value={p.placement_date} />
            <Field label="Date of Final Prosthesis Placement" value={p.final_prosthesis_date} />
          </View>
        ) : (
          <View style={styles.body}>
            <Field label="Type of Prosthesis" value={card.implant.prosthesis_type} />
            {card.implant.implants.map((imp, i) => (
              <View key={`${imp.site}-${i}`} style={styles.implantBox} testID={`iic-implant-${i}`}>
                <Text style={styles.implantSite}>Site {imp.site}</Text>
                <Row label="Company & Name" value={imp.company} />
                <Row label="Dimensions (Ø x L)" value={imp.dimensions} />
                <Row label="Model" value={imp.model} />
                <Row label="Lot Number" value={imp.lot} />
                <Row label="Serial Number" value={imp.serial} />
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText} testID="iic-card-number">Card No: {card.card_number}</Text>
          <Text style={styles.footerText}>Issued: {issued}</Text>
        </View>
      </View>

      {card.warnings.length > 0 && (
        <View style={styles.warnBox} testID="iic-warnings">
          <Ionicons name="warning-outline" size={16} color="#E65100" />
          <View style={{ flex: 1 }}>
            {card.warnings.map((w) => <Text key={w} style={styles.warnText}>{w}</Text>)}
            <Text style={styles.warnHint}>Check Implant Traceability (scan the implant box), then re-issue the card.</Text>
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={downloadPdf} disabled={!!busy} testID="iic-download-btn">
          {busy === 'pdf' ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Ionicons name={Platform.OS === 'web' ? 'download-outline' : 'share-outline'} size={16} color="#FFF" />
              <Text style={styles.primaryText}>{Platform.OS === 'web' ? 'Download PDF' : 'Share PDF'}</Text>
            </>
          )}
        </TouchableOpacity>
        {card.can_reissue && (
          <TouchableOpacity style={styles.secondaryBtn} onPress={confirmReissue} disabled={!!busy} testID="iic-reissue-btn">
            {busy === 'reissue' ? <ActivityIndicator color="#0D47A1" /> : (
              <>
                <Ionicons name="refresh-outline" size={16} color="#0D47A1" />
                <Text style={styles.secondaryText}>Re-issue</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.fieldValue, value === NR && styles.missing]}>{value}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, value === NR && styles.missing]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E3EAF3' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#0D47A1' },
  subtitle: { fontSize: 12, color: '#607D8B', marginTop: 4, marginBottom: 12 },
  toggle: { flexDirection: 'row', backgroundColor: '#ECEFF1', borderRadius: 10, padding: 3, marginBottom: 12 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, minHeight: 44, justifyContent: 'center' },
  toggleBtnActive: { backgroundColor: '#FFF' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#78909C' },
  toggleTextActive: { color: '#0D47A1' },
  card: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#CFD8DC', backgroundColor: '#FFF' },
  band: { backgroundColor: '#0D47A1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  inst: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  bandSub: { color: '#BBDEFB', fontSize: 10, marginTop: 2, letterSpacing: 0.5 },
  badge: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#0D47A1', fontSize: 16, fontWeight: '800' },
  body: { padding: 14 },
  field: { marginBottom: 10 },
  fieldLabel: { fontSize: 10, color: '#78909C', letterSpacing: 0.4 },
  fieldValue: { fontSize: 14, fontWeight: '700', color: '#263238', marginTop: 2 },
  implantBox: { backgroundColor: '#F5F9FF', borderRadius: 8, padding: 10, marginTop: 8 },
  implantSite: { fontSize: 13, fontWeight: '800', color: '#0D47A1', marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 3 },
  rowLabel: { width: 130, fontSize: 12, color: '#607D8B' },
  rowValue: { flex: 1, fontSize: 12, fontWeight: '600', color: '#263238' },
  missing: { color: '#C62828', fontStyle: 'italic', fontWeight: '500' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#ECEFF1', paddingHorizontal: 14, paddingVertical: 8 },
  footerText: { fontSize: 11, color: '#78909C' },
  warnBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF3E0', borderRadius: 8, padding: 10, marginTop: 12 },
  warnText: { fontSize: 12, color: '#E65100', fontWeight: '600' },
  warnHint: { fontSize: 11, color: '#8D6E63', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D47A1', borderRadius: 10, minHeight: 46 },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  secondaryBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#0D47A1', borderRadius: 10, minHeight: 46, paddingHorizontal: 16 },
  secondaryText: { color: '#0D47A1', fontWeight: '700', fontSize: 14 },
  errorText: { fontSize: 13, color: '#C62828', marginTop: 8 },
  retry: { marginTop: 10, alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#E3F2FD' },
  retryText: { color: '#0D47A1', fontWeight: '700' },
});
