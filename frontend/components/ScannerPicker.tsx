import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../utils/api';

export type ScannerValue = {
  company: string;        // master-list company or 'Other'
  companyOther: string;
  model: string;          // master-list model or 'Other'
  modelOther: string;
};

/**
 * iter-Jun-2026: "Intraoral Scanner Used" — searchable company dropdown →
 * model dropdown for that company → "Other" free text at either level.
 * Companies/models come from GET /intraoral-scanners (verified master list).
 */
export default function ScannerPicker({ value, onChange }: { value: ScannerValue; onChange: (v: ScannerValue) => void }) {
  const [groups, setGroups] = useState<{ company: string; models: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get('/intraoral-scanners');
        setGroups(Array.isArray(r.data) ? r.data : []);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredCompanies = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return groups;
    return groups.filter((g) => g.company.toLowerCase().includes(s) || g.models.some((m) => m.toLowerCase().includes(s)));
  }, [groups, q]);

  const models = useMemo(() => groups.find((g) => g.company === value.company)?.models || [], [groups, value.company]);
  const companyLabel = value.company === 'Other' ? (value.companyOther ? `Other — ${value.companyOther}` : 'Other') : value.company;
  const modelLabel = value.model === 'Other' ? (value.modelOther ? `Other — ${value.modelOther}` : 'Other') : value.model;

  return (
    <View testID="scanner-picker">
      {/* Company */}
      <Text style={st.label}>Company <Text style={st.req}>*</Text></Text>
      <TouchableOpacity
        style={st.dropdown}
        onPress={() => { setCompanyOpen((o) => !o); setModelOpen(false); }}
        testID="scanner-company-dropdown"
      >
        <Ionicons name="business-outline" size={18} color="#1A73E8" />
        <Text style={[st.dropdownText, !value.company && st.placeholder]} numberOfLines={1}>{companyLabel || 'Select scanner company'}</Text>
        {loading ? <ActivityIndicator size="small" color="#1A73E8" /> : <Ionicons name={companyOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />}
      </TouchableOpacity>
      {companyOpen && (
        <View style={st.list}>
          <View style={st.searchRow}>
            <Ionicons name="search" size={16} color="#999" />
            <TextInput
              style={st.searchInput}
              placeholder="Search company or model…"
              placeholderTextColor="#999"
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
              testID="scanner-company-search"
            />
            {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={16} color="#999" /></TouchableOpacity> : null}
          </View>
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filteredCompanies.map((g) => {
              const active = value.company === g.company;
              return (
                <TouchableOpacity
                  key={g.company}
                  style={[st.item, active && st.itemActive]}
                  onPress={() => { onChange({ company: g.company, companyOther: '', model: '', modelOther: '' }); setCompanyOpen(false); setModelOpen(true); setQ(''); }}
                  testID={`scanner-company-${g.company.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                >
                  <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color={active ? '#1A73E8' : '#999'} />
                  <Text style={[st.itemText, active && st.itemTextActive]}>{g.company}</Text>
                  <Text style={st.itemCount}>{g.models.length}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[st.item, value.company === 'Other' && st.itemActive]}
              onPress={() => { onChange({ company: 'Other', companyOther: '', model: 'Other', modelOther: '' }); setCompanyOpen(false); setQ(''); }}
              testID="scanner-company-other"
            >
              <Ionicons name="create-outline" size={16} color="#E65100" />
              <Text style={[st.itemText, { color: '#E65100', fontWeight: '600' }]}>Other (not listed)</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
      {value.company === 'Other' && (
        <TextInput
          style={st.input}
          placeholder="Enter scanner company"
          placeholderTextColor="#999"
          value={value.companyOther}
          onChangeText={(t) => onChange({ ...value, companyOther: t })}
          testID="scanner-company-other-input"
        />
      )}

      {/* Model */}
      {!!value.company && (
        <>
          <Text style={[st.label, { marginTop: 12 }]}>Model <Text style={st.req}>*</Text></Text>
          {value.company === 'Other' ? (
            <TextInput
              style={st.input}
              placeholder="Enter scanner model"
              placeholderTextColor="#999"
              value={value.modelOther}
              onChangeText={(t) => onChange({ ...value, model: 'Other', modelOther: t })}
              testID="scanner-model-other-input"
            />
          ) : (
            <>
              <TouchableOpacity style={st.dropdown} onPress={() => setModelOpen((o) => !o)} testID="scanner-model-dropdown">
                <Ionicons name="hardware-chip-outline" size={18} color="#1A73E8" />
                <Text style={[st.dropdownText, !value.model && st.placeholder]} numberOfLines={1}>{modelLabel || `Select ${value.company} model`}</Text>
                <Ionicons name={modelOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
              </TouchableOpacity>
              {modelOpen && (
                <View style={st.list}>
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                    {models.map((m) => {
                      const active = value.model === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[st.item, active && st.itemActive]}
                          onPress={() => { onChange({ ...value, model: m, modelOther: '' }); setModelOpen(false); }}
                          testID={`scanner-model-${m.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`}
                        >
                          <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={16} color={active ? '#1A73E8' : '#999'} />
                          <Text style={[st.itemText, active && st.itemTextActive]}>{m}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[st.item, value.model === 'Other' && st.itemActive]}
                      onPress={() => { onChange({ ...value, model: 'Other', modelOther: '' }); setModelOpen(false); }}
                      testID="scanner-model-other"
                    >
                      <Ionicons name="create-outline" size={16} color="#E65100" />
                      <Text style={[st.itemText, { color: '#E65100', fontWeight: '600' }]}>Other model (not listed)</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}
              {value.model === 'Other' && (
                <TextInput
                  style={st.input}
                  placeholder={`Enter ${value.company} model name`}
                  placeholderTextColor="#999"
                  value={value.modelOther}
                  onChangeText={(t) => onChange({ ...value, modelOther: t })}
                  testID="scanner-model-other-input"
                />
              )}
            </>
          )}
          {(value.company === 'Other' || value.model === 'Other') && (
            <Text style={st.hint}>New scanners you enter are sent to the Implant In-Charge for approval and then appear in this list for everyone.</Text>
          )}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#37474F', marginBottom: 6 },
  req: { color: '#DC3545' },
  dropdown: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46,
    borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, paddingHorizontal: 12, backgroundColor: '#F8FAFC',
  },
  dropdownText: { flex: 1, fontSize: 14, color: '#222' },
  placeholder: { color: '#999' },
  list: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, marginTop: 6, backgroundColor: '#FFF', overflow: 'hidden' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, minHeight: 42, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  searchInput: { flex: 1, fontSize: 14, color: '#222', paddingVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  itemActive: { backgroundColor: '#E3F2FD' },
  itemText: { flex: 1, fontSize: 14, color: '#333' },
  itemTextActive: { color: '#1A73E8', fontWeight: '700' },
  itemCount: { fontSize: 11, color: '#999' },
  input: {
    marginTop: 8, minHeight: 44, borderWidth: 1.5, borderColor: '#FFB74D', borderRadius: 10,
    paddingHorizontal: 12, fontSize: 14, color: '#222', backgroundColor: '#FFF8E1',
  },
  hint: { fontSize: 11, color: '#78909C', marginTop: 6 },
});
