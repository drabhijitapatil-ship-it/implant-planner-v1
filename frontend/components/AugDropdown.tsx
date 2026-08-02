/**
 * iter-394 — Inline expanding dropdown with tick-boxes for the Pre-Implant
 * Augmentation forms. Multi-select (checkboxes) or single-select (radios).
 * Closed state shows the selection summary; open state expands in place.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Props {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  multi?: boolean;
  placeholder?: string;
  testPrefix: string;
}

export default function AugDropdown({ options, selected, onChange, multi = true, placeholder = 'Select…', testPrefix }: Props) {
  const [open, setOpen] = useState(false);
  const summary = selected.length ? selected.join(', ') : '';

  const toggle = (opt: string) => {
    if (multi) {
      onChange(selected.includes(opt) ? selected.filter(o => o !== opt) : [...selected, opt]);
    } else {
      onChange([opt]);
      setOpen(false);
    }
  };

  return (
    <View style={[s.wrap, open && s.wrapOpen]}>
      <TouchableOpacity style={s.trigger} onPress={() => setOpen(!open)} testID={`${testPrefix}-trigger`}>
        <Text style={[s.triggerText, !summary && s.placeholderText]} numberOfLines={2}>
          {summary || placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color="#1565C0" />
      </TouchableOpacity>
      {open && (
        <View style={s.panel}>
          {options.map(opt => {
            const on = selected.includes(opt);
            return (
              <TouchableOpacity key={opt} style={s.optionRow} onPress={() => toggle(opt)} testID={`${testPrefix}-${slug(opt)}`}>
                {multi ? (
                  <View style={[s.checkbox, on && s.checkboxOn]}>
                    {on && <Ionicons name="checkmark" size={13} color="#FFF" />}
                  </View>
                ) : (
                  <View style={[s.radio, on && s.radioOn]}>
                    {on && <View style={s.radioDot} />}
                  </View>
                )}
                <Text style={[s.optionText, on && s.optionTextOn]}>{opt}</Text>
              </TouchableOpacity>
            );
          })}
          {multi && (
            <TouchableOpacity style={s.doneBtn} onPress={() => setOpen(false)} testID={`${testPrefix}-done`}>
              <Ionicons name="checkmark-circle" size={15} color="#FFF" />
              <Text style={s.doneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1.5, borderColor: '#D0DCE8', borderRadius: 10, backgroundColor: '#F8FAFC', overflow: 'hidden' },
  wrapOpen: { borderColor: '#1565C0', backgroundColor: '#FFF' },
  trigger: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, gap: 8 },
  triggerText: { flex: 1, fontSize: 13, color: '#263238', fontWeight: '600' },
  placeholderText: { color: '#90A4AE', fontWeight: '400' },
  panel: { borderTopWidth: 1, borderTopColor: '#E3EAF2', paddingVertical: 4, backgroundColor: '#FFF' },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  checkbox: { width: 19, height: 19, borderRadius: 5, borderWidth: 1.8, borderColor: '#B0BEC5', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  checkboxOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  radio: { width: 19, height: 19, borderRadius: 10, borderWidth: 1.8, borderColor: '#B0BEC5', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  radioOn: { borderColor: '#1565C0' },
  radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#1565C0' },
  optionText: { fontSize: 13, color: '#455A64', flex: 1 },
  optionTextOn: { color: '#1565C0', fontWeight: '700' },
  doneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1565C0', marginHorizontal: 10, marginVertical: 8, borderRadius: 8, paddingVertical: 9 },
  doneText: { color: '#FFF', fontSize: 12.5, fontWeight: '800' },
});
