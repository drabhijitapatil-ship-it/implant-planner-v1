/**
 * iter-214 — Shared FDI dental chart for tooth selection.
 *
 * Renders the 32-tooth anatomical chart (Universal-FDI 11-48) in two modes:
 *   • mode="multi"   : tap any tooth to toggle in/out of `value` array.
 *                      Used by the fresh-case missing-teeth selector and any
 *                      future "select 1+ teeth" use-case.
 *   • mode="single"  : tap a tooth to set it as the only value. Used by the
 *                      ExistingImplantSection per-implant row picker (wrapped
 *                      in a Modal there because it's one tooth per card).
 *
 * Tooth widths are biologically scaled (molars > premolars > canines >
 * incisors) so the chart resembles a real OPG view, which matches what
 * clinicians are trained to read. Colours: blue = present, red = selected.
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

const UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11'];
const UPPER_LEFT  = ['21', '22', '23', '24', '25', '26', '27', '28'];
const LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41'];
const LOWER_LEFT  = ['31', '32', '33', '34', '35', '36', '37', '38'];

const MOLARS = new Set(['16', '17', '18', '26', '27', '28', '36', '37', '38', '46', '47', '48']);
const PREMOLARS = new Set(['14', '15', '24', '25', '34', '35', '44', '45']);
const CANINES = new Set(['13', '23', '33', '43']);

const toothWidth = (t: string) =>
  MOLARS.has(t) ? 26 : PREMOLARS.has(t) ? 23 : CANINES.has(t) ? 22 : 20;
const toothHeight = (t: string) => (MOLARS.has(t) ? 32 : 28);
const toothRadius = (t: string) => (MOLARS.has(t) ? 5 : 9);

export type FdiMode = 'single' | 'multi';

type Props = {
  mode?: FdiMode;
  value: string | string[];                       // string when mode='single', string[] when mode='multi'
  onChange: (next: string | string[]) => void;
  selectedColor?: string;                          // default red — "selected for extraction" / "missing"
  presentColor?: string;                           // default blue — "present"
  selectedLabel?: string;                          // legend caption, default "Selected"
  presentLabel?: string;                           // legend caption, default "Present"
  showLegend?: boolean;
  testIDPrefix?: string;
};

export default function FdiAnatomicalChart({
  mode = 'multi',
  value,
  onChange,
  selectedColor = '#E53935',
  presentColor = '#1E88E5',
  selectedLabel = 'Missing',
  presentLabel = 'Present',
  showLegend = true,
  testIDPrefix = 'fdi',
}: Props) {
  const selected: string[] = mode === 'multi'
    ? (Array.isArray(value) ? value : [])
    : (typeof value === 'string' && value ? [value] : []);

  const handleTap = (t: string) => {
    if (mode === 'single') {
      onChange(t);
      return;
    }
    const cur = selected;
    onChange(cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]);
  };

  const renderTooth = (t: string) => {
    const isSelected = selected.includes(t);
    const w = toothWidth(t);
    const h = toothHeight(t);
    const r = toothRadius(t);
    return (
      <TouchableOpacity
        key={t}
        onPress={() => handleTap(t)}
        style={{
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: isSelected ? selectedColor : presentColor,
          borderWidth: 1.5,
          borderColor: isSelected ? '#B71C1C' : '#1565C0',
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: 1,
        }}
        testID={`${testIDPrefix}-${t}`}
        /* @ts-ignore */ data-testid={`${testIDPrefix}-${t}`}
      >
        <Text style={{ fontWeight: '700', fontSize: 9, color: '#FFF' }}>{t}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      {showLegend && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: presentColor }} />
            <Text style={{ fontSize: 10, color: '#546E7A' }}>{presentLabel}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: selectedColor }} />
            <Text style={{ fontSize: 10, color: '#546E7A' }}>{selectedLabel}</Text>
          </View>
        </View>
      )}

      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1565C0', marginBottom: 4, textAlign: 'center' }}>
        Upper Jaw (Maxillary)
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 2 }}>
        <View style={{ flexDirection: 'row' }}>{UPPER_RIGHT.map(renderTooth)}</View>
        <View style={{ width: 6 }} />
        <View style={{ flexDirection: 'row' }}>{UPPER_LEFT.map(renderTooth)}</View>
      </View>

      <View style={{ height: 1, backgroundColor: '#C5CDD5', marginVertical: 6, marginHorizontal: 20 }} />

      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1565C0', marginBottom: 4, textAlign: 'center' }}>
        Lower Jaw (Mandibular)
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 2 }}>
        <View style={{ flexDirection: 'row' }}>{LOWER_RIGHT.map(renderTooth)}</View>
        <View style={{ width: 6 }} />
        <View style={{ flexDirection: 'row' }}>{LOWER_LEFT.map(renderTooth)}</View>
      </View>
    </View>
  );
}
