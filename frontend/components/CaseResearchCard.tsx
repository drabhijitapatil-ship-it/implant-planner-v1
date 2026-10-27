/**
 * Research Module — case screen study card (S12): studies this case is in,
 * forms due, and active studies the case is eligible for.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../utils/api';
import { RC, Chip, FORM_STATUS, Field, PillSelect, PrimaryButton, errText } from './research/ResearchUI';

export default function CaseResearchCard({ procedureId, role }: { procedureId: string; role?: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ enrolled: any[]; eligible: any[]; offerable: any[] } | null>(null);
  const [offer, setOffer] = useState<any | null>(null);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentMethod, setConsentMethod] = useState('paper');
  const [consentLang, setConsentLang] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!procedureId || role === 'nurse') return;
    api.get(`/research/case/${procedureId}`).then(r => setData(r.data)).catch(() => setData(null));
  }, [procedureId, role]);
  useEffect(() => { load(); }, [load]);

  if (!data || role === 'nurse' || (data.enrolled.length === 0 && data.eligible.length === 0 && (data.offerable || []).length === 0)) return null;

  const openOffer = (o: any) => { setOffer(o); setTicks((o.checklist || []).map(() => false)); setConsent(false); setConsentLang(''); setMessage(''); };
  const sendOffer = async () => {
    if (!offer) return;
    setBusy(true);
    try {
      await api.post('/research/offers', { study_id: offer.study_id, procedure_id: procedureId, tooth_number: offer.tooth_number, consent_confirmed: consent,
        checklist_ticked: ticks, consent_method: consentMethod, consent_language: consentLang, message });
      Alert.alert('Case offered', `${offer.pi_name} (PI of ${offer.study_code}) has been notified and will accept or decline. Once accepted you can enter the study's visit data for this patient.`);
      setOffer(null); load();
    } catch (e) { Alert.alert('Not sent', errText(e)); } finally { setBusy(false); }
  };

  return (
    <View style={s.card} testID="case-research-card">
      <View style={s.hdr}>
        <Ionicons name="flask" size={16} color={RC.purple} />
        <Text style={s.title}>Research</Text>
      </View>
      {data.enrolled.map(e => (
        <TouchableOpacity key={e.enrolment_id} style={s.row} disabled={!e.is_member} onPress={() => router.push(`/research/enrolment/${e.enrolment_id}`)} testID={`case-study-${e.study_code}`}>
          <View style={{ flex: 1 }}>
            <Text style={s.code}>{e.study_code} · {e.subject_code}</Text>
            <Text style={s.sub} numberOfLines={1}>{e.study_title} · tooth {e.tooth_number}</Text>
            {e.forms_due.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {e.forms_due.map((f: any) => { const st = FORM_STATUS[f.status]; return <Chip key={f.timepoint_key} label={`${f.label} ${st.label.toLowerCase()}`} color={st.color} bg={st.bg} small />; })}
              </View>
            )}
          </View>
          {e.is_member && <Ionicons name="chevron-forward" size={16} color={RC.muted} />}
        </TouchableOpacity>
      ))}
      {data.eligible.map(e => (
        <TouchableOpacity key={`${e.study_id}-${e.tooth_number}`} style={[s.row, s.eligible]} onPress={() => router.push(`/research/${e.study_id}/screening`)} testID={`case-eligible-${e.study_code}`}>
          <Ionicons name={e.result === 'eligible' ? 'checkmark-circle' : 'help-circle'} size={18} color={e.result === 'eligible' ? RC.green : RC.amber} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={s.code}>{e.result === 'eligible' ? 'Eligible for' : 'Possible candidate for'} {e.study_code}</Text>
            <Text style={s.sub} numberOfLines={1}>Tooth {e.tooth_number} · {e.study_title}</Text>
          </View>
          <Text style={s.add}>Add to study</Text>
        </TouchableOpacity>
      ))}
      {(data.offerable || []).map(o => (
        <TouchableOpacity key={`offer-${o.study_id}-${o.tooth_number}`} style={[s.row, s.eligible]} disabled={!!o.pending_request}
          onPress={() => (o.pending_request?.can_respond ? router.push(`/research/inclusion/${o.pending_request.id}`) : openOffer(o))} testID={`case-offer-${o.study_code}`}>
          <Ionicons name="gift-outline" size={18} color={RC.purple} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={s.code}>{o.result === 'eligible' ? 'Eligible for' : 'Possible candidate for'} {o.study_code} <Text style={{ color: RC.sub, fontWeight: '600' }}>(PI {o.pi_name})</Text></Text>
            <Text style={s.sub} numberOfLines={2}>Tooth {o.tooth_number} · {o.study_title}{o.pending_request ? (o.pending_request.direction === 'offer' ? ' · offer pending with the study team' : ` · inclusion requested by ${o.pending_request.requested_by}`) : ''}</Text>
          </View>
          {o.pending_request ? (o.pending_request.can_respond ? <Text style={s.add}>Respond</Text> : <Chip label="Pending" color={RC.amber} bg={RC.amberSoft} small />) : <Text style={s.add}>Offer case</Text>}
        </TouchableOpacity>
      ))}

      <Modal visible={!!offer} animationType="slide" transparent onRequestClose={() => setOffer(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={s.sheetTitle}>Offer this case to {offer?.study_code}</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => setOffer(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Ionicons name="close" size={22} color={RC.sub} /></TouchableOpacity>
            </View>
            <Text style={s.sub}>{offer?.study_title} · PI {offer?.pi_name} · tooth {offer?.tooth_number}</Text>
            <ScrollView style={{ marginTop: 10, maxHeight: 420 }} keyboardShouldPersistTaps="handled">
              <Text style={s.sub}>You remain the treating clinician. The study team sees this patient only after they accept; you will then be able to enter the study's visit data at your recall visits.</Text>
              {(offer?.checklist || []).length > 0 && <Text style={[s.code, { marginTop: 10 }]}>Clinical checklist</Text>}
              {(offer?.checklist || []).map((c: any, i: number) => (
                <TouchableOpacity key={i} style={s.tickRow} onPress={() => setTicks(t => t.map((x, j) => (j === i ? !x : x)))} testID={`offer-tick-${i}`}>
                  <Ionicons name={ticks[i] ? 'checkbox' : 'square-outline'} size={22} color={ticks[i] ? RC.primary : RC.muted} />
                  <Text style={s.tickTxt}>{c.kind === 'exclude' ? 'Confirmed ABSENT: ' : ''}{c.text}</Text>
                </TouchableOpacity>
              ))}
              <Text style={[s.code, { marginTop: 10 }]}>Research consent</Text>
              <PillSelect value={consentMethod} onChange={setConsentMethod} options={[{ key: 'paper', label: 'Paper form signed' }, { key: 'e_consent', label: 'E-consent' }]} />
              <View style={{ height: 8 }} />
              <Field label="Consent language" value={consentLang} onChangeText={setConsentLang} placeholder="English / Hindi / Marathi…" />
              <TouchableOpacity style={s.tickRow} onPress={() => setConsent(c => !c)} testID="offer-consent-tick">
                <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? RC.primary : RC.muted} />
                <Text style={s.tickTxt}>Patient signed the study's research consent{offer?.consent_form_version ? ` (${offer.consent_form_version})` : ''} and understands withdrawal rights.</Text>
              </TouchableOpacity>
              <Field label="Message to the study team (optional)" value={message} onChangeText={setMessage} multiline placeholder="e.g. Recall visits are with me every 3 months." />
            </ScrollView>
            <PrimaryButton label="Offer case" icon="paper-plane-outline" onPress={sendOffer} loading={busy} style={{ marginTop: 12 }} testID="confirm-offer" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 12, borderWidth: 1, borderColor: '#E1BEE7' },
  hdr: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  title: { marginLeft: 6, fontSize: 13, fontWeight: '800', color: RC.purple, letterSpacing: 0.4, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3E5F5', minHeight: 48 },
  eligible: { backgroundColor: '#FAF5FC', borderRadius: 10, paddingHorizontal: 8, borderTopWidth: 0, marginTop: 6 },
  code: { fontSize: 13, fontWeight: '700', color: RC.text },
  sub: { fontSize: 11, color: RC.sub, marginTop: 1 },
  add: { fontSize: 12, fontWeight: '700', color: RC.purple, marginLeft: 6 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,25,40,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: RC.text },
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  tickTxt: { flex: 1, marginLeft: 10, fontSize: 13, color: RC.text, lineHeight: 18 },
});
