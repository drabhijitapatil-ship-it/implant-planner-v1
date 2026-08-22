/**
 * iter-Feb-2026 — GroupedDescDropdown.
 *
 * Single-select scrollable dropdown that renders options in labelled
 * groups and shows a short clinical description under each option label.
 *
 * Used for the new Single-Conventional-Implant workflow:
 *   - Type of Provisional (Phase 1 + Phase 2 Step 2)
 *   - Abutment Type / Type of Retention / Crown Material (Phase 1 + Phase 4 Step 1)
 *
 * The list is capped in height and scrolls internally so the parent
 * form does not visually explode when the picker is expanded.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GroupedOptions, OptionDesc } from '../constants/singleConventional';

type Props = {
  label?: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  /** Either a grouped list (with section headers) OR a flat list. */
  groups?: GroupedOptions;
  options?: OptionDesc[];
  placeholder?: string;
  testID?: string;
  disabled?: boolean;
  /** Optional cap on scroll height (default 320). */
  maxHeight?: number;
};

export default function GroupedDescDropdown({
  label,
  required,
  value,
  onChange,
  groups,
  options,
  placeholder = 'Select…',
  testID,
  disabled,
  maxHeight = 320,
}: Props) {
  const [open, setOpen] = useState(false);

  const activeDescription = useMemo(() => {
    if (!value) return '';
    if (groups) {
      for (const g of groups) {
        const hit = g.options.find(o => o.label === value);
        if (hit) return hit.description;
      }
    }
    if (options) {
      const hit = options.find(o => o.label === value);
      if (hit) return hit.description;
    }
    return '';
  }, [value, groups, options]);

  return (
    <View style={styles.wrap} testID={testID}>
      {!!label && (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={{ color: '#DC3545' }}> *</Text> : null}
        </Text>
      )}

      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.trigger, disabled && { opacity: 0.5 }]}
        onPress={() => !disabled && setOpen(o => !o)}
        testID={testID ? `${testID}-trigger` : undefined}
      >
        <Text
          style={[styles.triggerText, !value && { color: '#9AA5B2' }]}
          numberOfLines={2}
        >
          {value || placeholder}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#5F6B7A" />
      </TouchableOpacity>

      {!!activeDescription && !open && (
        <Text style={styles.activeDesc}>{activeDescription}</Text>
      )}

      {open && (
        <View style={[styles.listBox, { maxHeight }]}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
            {groups?.map(group => (
              <View key={group.group}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupHeaderText}>{group.group}</Text>
                </View>
                {group.options.map(opt => (
                  <OptionRow
                    key={opt.label}
                    opt={opt}
                    selected={opt.label === value}
                    onPress={() => {
                      onChange(opt.label);
                      setOpen(false);
                    }}
                  />
                ))}
              </View>
            ))}
            {options?.map(opt => (
              <OptionRow
                key={opt.label}
                opt={opt}
                selected={opt.label === value}
                onPress={() => {
                  onChange(opt.label);
                  setOpen(false);
                }}
              />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function OptionRow({
  opt, selected, onPress,
}: { opt: OptionDesc; selected: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.optionRow, selected && styles.optionRowActive]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>
          {opt.label}
        </Text>
        {!!opt.description && (
          <Text style={styles.optionDesc}>{opt.description}</Text>
        )}
      </View>
      {selected && (
        <Ionicons name="checkmark-circle" size={20} color="#1A73E8" style={{ marginLeft: 8 }} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#37474F',
    marginBottom: 6,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: '#263238',
    marginRight: 8,
  },
  activeDesc: {
    marginTop: 6,
    fontSize: 12,
    color: '#546E7A',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  listBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#CFD8DC',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  groupHeader: {
    backgroundColor: '#ECEFF1',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CFD8DC',
  },
  groupHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#37474F',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E9EE',
  },
  optionRowActive: {
    backgroundColor: '#E8F0FE',
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#263238',
  },
  optionLabelActive: {
    color: '#1A73E8',
  },
  optionDesc: {
    marginTop: 3,
    fontSize: 12,
    color: '#607D8B',
    lineHeight: 16,
  },
});
