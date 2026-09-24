import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import api from '../utils/api';

export type AssistantCandidate = { id: string; name: string };

/**
 * iter-Jun-2026: "Name of the Assistant" dropdown.
 * Lists every Postgraduate Student except the signed-in user (backend
 * excludes the caller) and optionally the case owner. Selecting "No assistant"
 * clears the value — the field is never mandatory.
 */
export default function AssistantPicker({
  valueId,
  valueName,
  onChange,
  excludeIds = [],
  label = 'Name of the Assistant',
  helper = 'Optional — a Postgraduate Student who will assist and can review this case (read-only).',
}: {
  valueId: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
  excludeIds?: (string | undefined | null)[];
  label?: string;
  helper?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<AssistantCandidate[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/procedures/assistant-candidates');
        if (alive) setCandidates(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (alive) setCandidates([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const excluded = new Set(excludeIds.filter(Boolean) as string[]);
  const visible = candidates.filter((c) => !excluded.has(c.id));

  return (
    <View style={styles.fieldContainer} data-testid="assistant-picker">
      <Text style={styles.label}>
        {label} <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => setOpen((o) => !o)}
        testID="assistant-dropdown"
        data-testid="assistant-dropdown"
        accessibilityRole="button"
      >
        <Ionicons name="people-outline" size={18} color="#1565C0" style={{ marginRight: 8 }} />
        <Text style={[styles.dropdownText, !valueName && styles.placeholder]} numberOfLines={1}>
          {valueName || 'Select assistant (Postgraduate Student)'}
        </Text>
        {loading ? (
          <ActivityIndicator size="small" color="#1565C0" />
        ) : (
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
        )}
      </TouchableOpacity>
      {open && (
        <ScrollView style={styles.dropdownList} nestedScrollEnabled>
          <TouchableOpacity
            style={styles.dropdownItem}
            onPress={() => { onChange('', ''); setOpen(false); }}
            testID="assistant-option-none"
            data-testid="assistant-option-none"
          >
            <Ionicons name="close-circle-outline" size={16} color="#999" />
            <Text style={[styles.dropdownItemText, { color: '#999' }]}>No assistant</Text>
          </TouchableOpacity>
          {visible.length === 0 && !loading ? (
            <View style={styles.dropdownItem}>
              <Text style={[styles.dropdownItemText, { color: '#999' }]}>No other Postgraduate Students available</Text>
            </View>
          ) : null}
          {visible.map((c) => {
            const selected = c.id === valueId;
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                onPress={() => { onChange(c.id, c.name); setOpen(false); }}
                testID={`assistant-option-${c.id}`}
                data-testid={`assistant-option-${c.id}`}
              >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={16} color={selected ? '#1565C0' : '#999'} />
                <Text style={[styles.dropdownItemText, selected && { color: '#1565C0', fontWeight: '700' }]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      {!!helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldContainer: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  optional: { fontSize: 12, fontWeight: '500', color: '#888' },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
  },
  dropdownText: { flex: 1, fontSize: 15, color: '#222' },
  placeholder: { color: '#999' },
  dropdownList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    marginTop: 6,
    backgroundColor: '#FFF',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: { backgroundColor: '#E3F2FD' },
  dropdownItemText: { fontSize: 15, color: '#333' },
  helper: { fontSize: 12, color: '#777', marginTop: 6 },
});
