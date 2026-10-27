/**
 * Research Module — inclusion request detail (multi-operator recruitment).
 * Treating clinician: accept (confirm consent + checklist) or decline a study team's request.
 * PI / co-investigator: accept or decline a case offered by its treating clinician.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../../utils/api';
import { RC, Card, Chip, Field, Loading, PillSelect, PrimaryButton, ScreenHeader, SectionTitle, errText, u } from '../../../components/research/ResearchUI';

export default function InclusionRequestScreen() {
  const { rid } = useLocalSearchParams<{ rid: string }>();
  const router = useRouter();
  const [req, setReq] = useState<any | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ticks, setTicks] = useState<boolean[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentMethod, setConsentMethod] = useState('paper');
  const [consentLang, setConsentLang] = useState('');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState('');
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.get(`/research/inclusion-requests/${rid}`); setReq(r.data); setTicks((r.data.study.checklist || []).map(() => false)); }
    catch (e) { Alert.alert('Error', errText(e)); } finally { setRefreshing(false); }
  }, [rid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!req) return <Loading />;
  const isRequest = req.direction === 'request';
  const iAmTreating = req.can_respond && isRequest;
  const checklist: any[] = req.study.checklist || [];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/research'));

  const respond = async (action: 'accept' | 'decline') => {
    setBusy(true);
    try {
      const body: any = { action, reason, override_reason: override };
      if (action === 'accept' && isRequest) Object.assign(body, { consent_confirmed: consent, checklist_ticked: ticks, consent_method: consentMethod, consent_language: consentLang });
      if (action === 'accept' && !isRequest) body.checklist_ticked = checklist.map(() => true);
      const r = await api.post(`/research/inclusion-requests/${rid}/respond`, body);
      if (action === 'accept') {
        const enr = r.data.enrolment;
        Alert.alert('Case included', `Enrolled as ${enr.subject_code}. ${enr.forms.length} visit forms scheduled.${iAmTreating ? ' You can enter visit data for this case from Research → forms due.' : ''}`,
          [{ text: 'Open enrolment', onPress: () => router.replace(`/research/enrolment/${enr.id}`) }, { text: 'Done', onPress: back }]);
      } else { Alert.alert('Declined', 'The requester has been notified.'); back(); }
    } catch (e) { Alert.alert('Not saved', errText(e)); } finally { setBusy(false); }
  };
  const cancel = () => Alert.alert('Cancel request?', '', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel request', style: 'destructive', onPress: async () => {
    try { await api.post(`/research/inclusion-requests/${rid}/cancel`); back(); } catch (e) { Alert.alert('Error', errText(e)); }
  } }]);

  const statusChip = { pending: [RC.amber, RC.amberSoft], accepted: [RC.green, RC.greenSoft], declined: [RC.red, RC.redSoft], cancelled: [RC.sub, RC.greySoft] }[req.status as string] || [RC.sub, RC.greySoft];

  return (
    <SafeAreaView style={u.container} edges={['bottom']}>
      <ScreenHeader title={isRequest ? 'Inclusion request' : 'Case offered to study'} subtitle={`${req.study.code} · tooth ${req.tooth_number}`} onBack={back} testID="inclusion-title"
        right={<Chip label={req.status} color={statusChip[0]} bg={statusChip[1]} testID="inclusion-status" />} />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />} keyboardShouldPersistTaps="handled">
        <Card>
          <SectionTitle title={isRequest ? 'The study team asks to include your case' : 'A treating clinician offers this case'} icon={isRequest ? 'paper-plane-outline' : 'gift-outline'} />
          <Text style={u.strong}>{req.study.code} — {req.study.title}</Text>
          <Text style={u.kv}>PI {req.study.pi_name}{req.study.iec_ref ? ` · IEC ${req.study.iec_ref}` : ''}</Text>
          {!!req.study.research_question && <Text style={[u.kv, { fontStyle: 'italic', marginTop: 4 }]}>{req.study.research_question}</Text>}
          <View style={[u.row, { flexWrap: 'wrap', gap: 6, marginTop: 8 }]}>
            <Chip label={`${isRequest ? 'Requested' : 'Offered'} by ${req.requested_by}`} color={RC.text} bg={RC.greySoft} small />
            <Chip label={req.eligibility === 'eligible' ? 'Eligible' : 'Needs review'} color={req.eligibility === 'eligible' ? RC.green : RC.amber} bg={req.eligibility === 'eligible' ? RC.greenSoft : RC.amberSoft} small />
            <Chip label={String(req.created_at).slice(0, 10)} color={RC.sub} bg={RC.greySoft} small />
          </View>
          {!!req.message && <Text style={s.msg}>“{req.message}”</Text>}
          {!!req.override_reason && <Text style={[u.kv, { marginTop: 6 }]}>PI override reason: {req.override_reason}</Text>}
        </Card>

        <Card>
          <SectionTitle title="Case" icon="medkit-outline" />
          <Text style={u.strong}>{req.patient_name || 'Patient identity hidden until accepted'}</Text>
          <Text style={u.kv}>Tooth {req.tooth_number}{req.implant?.system ? ` · ${req.implant.brand || ''} ${req.implant.system}` : ''}{req.implant?.length ? ` · ${req.implant.diameter || ''}×${req.implant.length} mm` : ''}{req.implant?.placement_date ? ` · placed ${req.implant.placement_date}` : ''}</Text>
          <Text style={[u.kv, { marginTop: 4 }]}>Treating: {(req.treating || []).map((t: any) => `${t.name} (${t.label})`).join(', ') || '—'}</Text>
          <Text style={[u.kv, { marginTop: 4 }]}>Follow-up visits: {(req.study.timepoints || []).map((t: any) => t.label).join(' → ')}</Text>
        </Card>

        {req.status !== 'pending' && (
          <Card>
            <Text style={u.kv}>{req.status === 'accepted' ? `Accepted by ${req.decided_by} on ${String(req.decided_at).slice(0, 10)}.` : req.status === 'declined' ? `Declined by ${req.decided_by}: ${req.decision_reason}` : `Cancelled by ${req.decided_by}.`}</Text>
            {req.enrolment_id && <PrimaryButton label="Open enrolment" variant="outline" icon="open-outline" onPress={() => router.push(`/research/enrolment/${req.enrolment_id}`)} style={{ marginTop: 10 }} />}
          </Card>
        )}

        {req.can_respond && (
          <Card testID="respond-card">
            <SectionTitle title={declining ? 'Decline' : 'Accept and include'} icon={declining ? 'close-circle-outline' : 'checkmark-circle-outline'} />
            {declining ? (
              <>
                <Field label="Reason for declining (shared with the requester)" value={reason} onChangeText={setReason} multiline placeholder="e.g. Patient declined research participation / relocating" testID="decline-reason" />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PrimaryButton label="Back" variant="ghost" onPress={() => setDeclining(false)} />
                  <PrimaryButton label="Decline request" variant="danger" onPress={() => respond('decline')} loading={busy} style={{ flex: 1 }} testID="confirm-decline" />
                </View>
              </>
            ) : (
              <>
                {isRequest ? (
                  <>
                    <Text style={u.kv}>You treat this patient. Accepting confirms that the patient has signed the study consent{req.study.consent_form_version ? ` (${req.study.consent_form_version})` : ''}, and enrols the implant. You will be able to enter the study's visit data for this case at your recalls.</Text>
                    {checklist.length > 0 && <Text style={[u.label, { marginTop: 10 }]}>Clinical checklist</Text>}
                    {checklist.map((c: any, i: number) => (
                      <TouchableOpacity key={i} style={s.tickRow} onPress={() => setTicks(t => t.map((x, j) => (j === i ? !x : x)))} testID={`tick-${i}`}>
                        <Ionicons name={ticks[i] ? 'checkbox' : 'square-outline'} size={22} color={ticks[i] ? RC.primary : RC.muted} />
                        <Text style={s.tickTxt}>{c.kind === 'exclude' ? 'Confirmed ABSENT: ' : ''}{c.text}</Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={[u.label, { marginTop: 10 }]}>Research consent</Text>
                    <PillSelect value={consentMethod} onChange={setConsentMethod} options={[{ key: 'paper', label: 'Paper form signed' }, { key: 'e_consent', label: 'E-consent' }]} />
                    <View style={{ height: 8 }} />
                    <Field label="Consent language" value={consentLang} onChangeText={setConsentLang} placeholder="English / Hindi / Marathi…" />
                    <TouchableOpacity style={s.tickRow} onPress={() => setConsent(c => !c)} testID="consent-tick">
                      <Ionicons name={consent ? 'checkbox' : 'square-outline'} size={22} color={consent ? RC.primary : RC.muted} />
                      <Text style={s.tickTxt}>Patient signed the research consent and understands withdrawal rights.</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={u.kv}>The treating clinician confirmed the patient's research consent{req.offer_consent?.language ? ` (${req.offer_consent.language})` : ''} and the clinical checklist when offering this case. Accepting enrols it; the treating clinicians become case collaborators and can enter its visit data.</Text>
                    {req.eligibility !== 'eligible' && <Field label="PI override reason (eligibility needs review)" value={override} onChangeText={setOverride} multiline testID="override-reason" />}
                  </>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <PrimaryButton label="Decline" variant="ghost" onPress={() => setDeclining(true)} testID="start-decline" />
                  <PrimaryButton label={isRequest ? 'Accept & enrol' : 'Accept case'} icon="person-add-outline" onPress={() => respond('accept')} loading={busy} style={{ flex: 1 }} testID="confirm-accept" />
                </View>
              </>
            )}
          </Card>
        )}
        {req.can_cancel && <View style={{ marginHorizontal: 14, marginTop: 12 }}><PrimaryButton label="Cancel request" variant="outline" icon="trash-outline" onPress={cancel} testID="cancel-request" /></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  msg: { marginTop: 8, fontSize: 13, color: RC.text, fontStyle: 'italic', lineHeight: 18 },
  tickRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, minHeight: 44 },
  tickTxt: { flex: 1, marginLeft: 10, fontSize: 13, color: RC.text, lineHeight: 18 },
});
