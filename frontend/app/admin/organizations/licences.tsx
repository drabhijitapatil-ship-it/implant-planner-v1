import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Switch } from 'react-native';
import ScrollView from '@/components/KeyboardAwareScrollView';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../../utils/api';
import CenteredHeader from '../../../components/CenteredHeader';

/**
 * Super-admin editor for a dental college's department licences
 * (rate card: backend/college_licensing.py, from "Implanr Subscription
 * Plans.xlsx"). One licence per department / Centralised Implant Clinic /
 * Unit, sized by PG students on roll. The quote on this screen is computed
 * by the server exactly as the spreadsheet's College Quote sheet; saving
 * applies the pooled seat limits to the college.
 */

type Tier = { key: string; name: string; pg_to: number; price: number; supervisors: number; implant_incharges: number; admins: number };
type Line = { label: string; pg_students: string; tier_key: string | null };
type Quote = Record<string, any>;

const inr = (n?: number | null) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
const pct = (n?: number) => `${Math.round((n || 0) * 100)}%`;
const int = (v: string) => Math.max(0, parseInt(v || '0', 10) || 0);

export default function CollegeLicencesScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [lines, setLines] = useState<Line[]>([{ label: '', pg_students: '', tier_key: null }]);
  const [staff, setStaff] = useState({ supervisors_needed: '', incharges_needed: '', admins_needed: '', fellows: '', interns: '' });
  const [flags, setFlags] = useState({ research_module: false, founding: false, government: false, university_group: false, new_customer: true });
  const [termYears, setTermYears] = useState<1 | 3>(1);
  const [negotiated, setNegotiated] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [caps, setCaps] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prefill from the rate card + any licences already saved for this college.
  useEffect(() => {
    (async () => {
      try {
        const [card, sub] = await Promise.all([
          api.get('/admin/college-rate-card'),
          api.get(`/organizations/${id}/subscription`),
        ]);
        setTiers(card.data?.tiers || []);
        const cfg = sub.data?.licence_config;
        if (cfg) {
          setLines(cfg.licences.map((l: any) => ({ label: l.label, pg_students: String(l.pg_students), tier_key: l.tier_key || null })));
          setStaff({
            supervisors_needed: String(cfg.supervisors_needed || ''), incharges_needed: String(cfg.incharges_needed || ''),
            admins_needed: String(cfg.admins_needed || ''), fellows: String(cfg.fellows || ''), interns: String(cfg.interns || ''),
          });
          setFlags({
            research_module: !!cfg.research_module, founding: !!cfg.founding, government: !!cfg.government,
            university_group: !!cfg.university_group, new_customer: !!cfg.new_customer,
          });
          setTermYears(cfg.term_years === 3 ? 3 : 1);
          setNegotiated(cfg.negotiated_discount ? String(Math.round(cfg.negotiated_discount * 100)) : '');
        }
      } catch (e: any) {
        Alert.alert('Could not load', e?.response?.data?.detail || 'Please try again');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const payload = useCallback(() => ({
    licences: lines
      .filter((l) => l.label.trim() || int(l.pg_students))
      .map((l) => ({ label: l.label.trim() || 'Licence', pg_students: int(l.pg_students), tier_key: l.tier_key })),
    supervisors_needed: int(staff.supervisors_needed),
    incharges_needed: int(staff.incharges_needed),
    admins_needed: int(staff.admins_needed),
    fellows: int(staff.fellows),
    interns: int(staff.interns),
    ...flags,
    term_years: termYears,
    negotiated_discount: Math.min(30, Math.max(0, parseFloat(negotiated || '0') || 0)) / 100,
  }), [lines, staff, flags, termYears, negotiated]);

  // Live quote (debounced) whenever the inputs change.
  useEffect(() => {
    if (loading) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const body = payload();
      if (!body.licences.length) { setQuote(null); setCaps(null); return; }
      try {
        const { data } = await api.post('/admin/college-quote', body);
        setQuote(data.quote);
        setCaps(data.caps);
        setQuoteError('');
      } catch (e: any) {
        setQuoteError(typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Check the numbers entered');
      }
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [payload, loading]);

  const save = () => {
    const body = payload();
    if (!body.licences.length) return Alert.alert('Add a licence', 'Enter at least one department with its PG students.');
    Alert.alert(
      'Apply these licences?',
      `${quote?.licence_count} licence(s), ${quote?.total_pg_students} PGs — ${inr(quote?.net_annual_fee)}/year excl GST. ` +
        'The college\'s seat limits change immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          onPress: async () => {
            setSaving(true);
            try {
              await api.put(`/organizations/${id}/licences`, body);
              router.back();
            } catch (e: any) {
              Alert.alert('Could not save', typeof e?.response?.data?.detail === 'string' ? e.response.data.detail : 'Please try again');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <CenteredHeader title="Department Licences" fallback="/admin/organizations" />
        <ActivityIndicator style={{ marginTop: 40 }} color="#1565C0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <CenteredHeader title="Department Licences" subtitle={name || undefined} fallback="/admin/organizations" />
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.hint}>
          One licence per implant department, Centralised Implant Clinic or Unit, sized by PG students on roll (all 3 years).
          The tier is picked automatically; tap a tier to choose a bigger one.
        </Text>

        <Text style={s.group}>Licences</Text>
        {lines.map((l, i) => {
          const q = quote?.licences?.[i];
          return (
            <View key={i} style={s.card}>
              <View style={s.row}>
                <TextInput style={[s.input, { flex: 2 }]} value={l.label} placeholder="e.g. Prosthodontics" placeholderTextColor="#999"
                  onChangeText={(v) => setLine(i, { label: v })} testID={`licence-label-${i}`} />
                <TextInput style={[s.input, { flex: 1 }]} value={l.pg_students} placeholder="PGs" placeholderTextColor="#999"
                  keyboardType="number-pad" onChangeText={(v) => setLine(i, { pg_students: v.replace(/\D/g, '') })} testID={`licence-pg-${i}`} />
                {lines.length > 1 && (
                  <TouchableOpacity onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))} style={s.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={s.chips}>
                {tiers.map((t) => {
                  const active = (q?.tier_key || l.tier_key) === t.key;
                  const tooSmall = int(l.pg_students) > t.pg_to && t.key !== 'premier_24';
                  return (
                    <TouchableOpacity key={t.key} disabled={tooSmall}
                      style={[s.chip, active && s.chipActive, tooSmall && { opacity: 0.35 }]}
                      onPress={() => setLine(i, { tier_key: l.tier_key === t.key ? null : t.key })}>
                      <Text style={[s.chipText, active && { color: '#FFF' }]}>{t.name} · {inr(t.price)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {q && (
                <Text style={s.lineMeta}>
                  Includes {q.supervisors_included} supervisors · {q.incharges_included} in-charge{q.incharges_included === 1 ? '' : 's'} · {q.admins_included} admin
                  {q.admins_included === 1 ? '' : 's'}{q.extra_pg_students ? ` · ${q.extra_pg_students} extra PGs (${inr(q.extra_pg_charge)})` : ''}
                </Text>
              )}
            </View>
          );
        })}
        <TouchableOpacity style={s.addBtn} onPress={() => setLines((ls) => [...ls, { label: '', pg_students: '', tier_key: null }])} testID="licence-add">
          <Ionicons name="add" size={16} color="#1565C0" />
          <Text style={s.addText}>Add licence</Text>
        </TouchableOpacity>

        <Text style={s.group}>Staff the college needs (allowances are pooled)</Text>
        <View style={s.row}>
          <Num label="Supervisors" value={staff.supervisors_needed} onChange={(v) => setStaff((x) => ({ ...x, supervisors_needed: v }))} />
          <Num label="In-charges" value={staff.incharges_needed} onChange={(v) => setStaff((x) => ({ ...x, incharges_needed: v }))} />
          <Num label="Admins" value={staff.admins_needed} onChange={(v) => setStaff((x) => ({ ...x, admins_needed: v }))} />
        </View>

        <Text style={s.group}>Add-ons</Text>
        <View style={s.row}>
          <Num label="Fellows" value={staff.fellows} onChange={(v) => setStaff((x) => ({ ...x, fellows: v }))} />
          <Num label="Interns placing implants" value={staff.interns} onChange={(v) => setStaff((x) => ({ ...x, interns: v }))} />
        </View>
        <Toggle label="Research Module" value={flags.research_module} onChange={(v) => setFlags((f) => ({ ...f, research_module: v }))} />

        <Text style={s.group}>Commercial terms</Text>
        <Toggle label="Founding institution (25%, price locked 3 yrs)" value={flags.founding} onChange={(v) => setFlags((f) => ({ ...f, founding: v }))} />
        <Toggle label="Government college (20%)" value={flags.government} onChange={(v) => setFlags((f) => ({ ...f, government: v }))} />
        <Toggle label="University / group (15% on licences)" value={flags.university_group} onChange={(v) => setFlags((f) => ({ ...f, university_group: v }))} />
        <Toggle label="New customer (setup fee)" value={flags.new_customer} onChange={(v) => setFlags((f) => ({ ...f, new_customer: v }))} />
        <View style={[s.row, { alignItems: 'center', marginTop: 6 }]}>
          <Text style={[s.label, { flex: 1 }]}>Contract term</Text>
          {([1, 3] as const).map((t) => (
            <TouchableOpacity key={t} style={[s.chip, termYears === t && s.chipActive]} onPress={() => setTermYears(t)}>
              <Text style={[s.chipText, termYears === t && { color: '#FFF' }]}>{t === 1 ? '1 year' : '3 years prepaid'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={[s.row, { alignItems: 'center', marginTop: 8 }]}>
          <Text style={[s.label, { flex: 1 }]}>Extra negotiated discount (%)</Text>
          <TextInput style={[s.input, { width: 80 }]} value={negotiated} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#999"
            onChangeText={setNegotiated} />
        </View>

        <Text style={s.group}>Quote</Text>
        {!!quoteError && <Text style={s.error}>{quoteError}</Text>}
        {quote ? (
          <View style={s.quote} testID="licence-quote">
            <QRow label={`Licence fees (${quote.licence_count} licence${quote.licence_count === 1 ? '' : 's'}, ${quote.total_pg_students} PGs)`} value={inr(quote.licence_list)} />
            {quote.volume_discount > 0 && <QRow label={`Multi-department discount (${pct(quote.volume_discount)})`} value={`– ${inr(quote.licence_list - quote.licence_after_volume)}`} />}
            {quote.extra_users_charge > 0 && (
              <QRow label={`Extra users (${quote.extra_users.supervisors} sup · ${quote.extra_users.incharges} inch · ${quote.extra_users.admins} admin)`} value={inr(quote.extra_users_charge)} />
            )}
            {quote.intern_programme?.price > 0 && <QRow label={`Intern Programme (${quote.intern_programme.tier})`} value={inr(quote.intern_programme.price)} />}
            {quote.fellows_charge > 0 && <QRow label={`Fellows (${quote.fellows})`} value={inr(quote.fellows_charge)} />}
            {quote.research_charge > 0 && <QRow label="Research Module" value={inr(quote.research_charge)} />}
            <QRow label="Annual subtotal" value={inr(quote.annual_subtotal)} bold />
            {quote.commercial_discount > 0 && (
              <QRow label={`Discount — ${quote.commercial_discount_parts.join(' + ')} (${pct(quote.commercial_discount)}${quote.commercial_discount >= 0.3 ? ', capped' : ''})`}
                value={`– ${inr(quote.commercial_discount_amount)}`} />
            )}
            <QRow label="Net annual fee (excl GST)" value={inr(quote.net_annual_fee)} bold />
            {quote.setup_fee > 0 && <QRow label="One-time setup" value={inr(quote.setup_fee)} />}
            <QRow label={`Invoice on signing (excl GST${quote.term_years === 3 ? ', 3 years' : ''})`} value={inr(quote.invoice_ex_gst)} />
            <QRow label="GST @ 18%" value={inr(quote.gst)} />
            <QRow label="Total payable on signing" value={inr(quote.invoice_incl_gst)} bold />
            <QRow label="Renewal next year (excl GST)" value={inr(quote.renewal_fee_next_year)} />
            {quote.licence_cost_per_pg != null && <QRow label="Licence cost per PG per year" value={inr(quote.licence_cost_per_pg)} />}
            {caps && (
              <Text style={s.capsText}>
                Seat limits applied: {caps.role_caps.student} students (PG + fellows + interns) · {caps.role_caps.supervisor} supervisors ·{' '}
                {caps.role_caps.implant_incharge} in-charges · {caps.role_caps.administrator} admins · {caps.max_department} department
                {caps.max_department === 1 ? '' : 's'}
              </Text>
            )}
          </View>
        ) : (
          <Text style={s.hint}>Add a licence to see the quote.</Text>
        )}

        <TouchableOpacity style={[s.saveBtn, (saving || !quote) && { opacity: 0.6 }]} disabled={saving || !quote} onPress={save} testID="licence-save">
          {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.saveText}>Apply Licences to College</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} keyboardType="number-pad" placeholder="0" placeholderTextColor="#999"
        onChangeText={(v) => onChange(v.replace(/\D/g, ''))} />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggleRow}>
      <Text style={[s.label, { flex: 1, marginBottom: 0 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

function QRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.qRow}>
      <Text style={[s.qLabel, bold && { fontWeight: '800', color: '#0D2B4E' }]}>{label}</Text>
      <Text style={[s.qValue, bold && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scroll: { padding: 16, paddingBottom: 60 },
  hint: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 8 },
  group: { fontSize: 13, fontWeight: '800', color: '#0D47A1', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 18, marginBottom: 8 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E3E8EE' },
  row: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CFD8DC', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#1A1A1A' },
  label: { fontSize: 12, fontWeight: '600', color: '#37474F', marginBottom: 4 },
  iconBtn: { justifyContent: 'center', paddingHorizontal: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: '#BBDEFB', backgroundColor: '#FFF' },
  chipActive: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#1565C0' },
  lineMeta: { fontSize: 12, color: '#546E7A', marginTop: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#E3F2FD' },
  addText: { color: '#1565C0', fontWeight: '700', fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  quote: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E3E8EE' },
  qRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#F1F4F7' },
  qLabel: { flex: 1, fontSize: 13, color: '#455A64' },
  qValue: { fontSize: 13, color: '#263238', fontWeight: '600' },
  capsText: { fontSize: 12, color: '#2E7D32', marginTop: 10, lineHeight: 17 },
  error: { color: '#C62828', fontSize: 13, marginBottom: 6 },
  saveBtn: { backgroundColor: '#1565C0', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
