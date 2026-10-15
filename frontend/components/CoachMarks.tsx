/**
 * Coach-mark tour — spotlight overlay with a 3-step walkthrough shown once per
 * user after their first login (key coach_tour_seen_<userId>). Replayable from
 * Profile → Help via requestCoachTour().
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import Ionicons, { type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Rect4 = { x: number; y: number; w: number; h: number };
export type CoachStep = { title: string; body: string; icon: IoniconsIconName; rect?: Rect4 | null; radius?: number };

export const COACH_TOUR_VERSION = '1';
export const coachTourKey = (userId: string) => `coach_tour_seen_${userId}`;

// Tiny event bus so Profile → "Replay app tour" can re-open the tour owned by the tabs layout.
const listeners = new Set<() => void>();
export function requestCoachTour() { listeners.forEach(l => l()); }
export function onCoachTourRequest(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export default function CoachMarks({ visible, steps, onDone, testID = 'coach-tour' }: {
  visible: boolean; steps: CoachStep[]; onDone: () => void; testID?: string;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const [i, setI] = useState(0);
  useEffect(() => { if (visible) setI(0); }, [visible]);
  if (!visible || !steps.length) return null;
  const step = steps[Math.min(i, steps.length - 1)];
  const pad = 8;
  const r = step.rect ? { x: Math.max(0, step.rect.x - pad), y: Math.max(0, step.rect.y - pad), w: step.rect.w + pad * 2, h: step.rect.h + pad * 2 } : null;
  const cardH = 190;
  const below = r ? r.y + r.h + 16 + cardH < H : false;
  const top = r ? (below ? r.y + r.h + 16 : Math.max(24, r.y - cardH - 16)) : H / 2 - cardH / 2;
  const arrowX = r ? Math.min(W - 40, Math.max(28, r.x + r.w / 2)) : W / 2;
  const last = i === steps.length - 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={StyleSheet.absoluteFill} testID={testID}>
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="hole">
              <Rect x={0} y={0} width={W} height={H} fill="#FFF" />
              {r && <Rect x={r.x} y={r.y} width={r.w} height={r.h} rx={step.radius ?? 14} fill="#000" />}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={W} height={H} fill="rgba(10, 20, 40, 0.72)" mask="url(#hole)" />
          {r && <Rect x={r.x} y={r.y} width={r.w} height={r.h} rx={step.radius ?? 14} fill="transparent" stroke="#FFD54F" strokeWidth={2.5} />}
        </Svg>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => (last ? onDone() : setI(i + 1))} />
        <View style={[s.card, { top, left: 16, right: 16 }]} pointerEvents="box-none">
          {r && <View style={[s.arrow, below ? { top: -8 } : { bottom: -8 }, { left: arrowX - 16 - 8 }]} />}
          <View style={s.cardInner}>
            <View style={s.head}>
              <View style={s.iconWrap}><Ionicons name={step.icon} size={20} color="#1E88E5" /></View>
              <Text style={s.title} testID={`${testID}-title`}>{step.title}</Text>
              <Text style={s.counter}>{i + 1}/{steps.length}</Text>
            </View>
            <Text style={s.body}>{step.body}</Text>
            <View style={s.footer}>
              <View style={s.dots}>{steps.map((_, k) => <View key={k} style={[s.dot, k === i && s.dotOn]} />)}</View>
              <View style={{ flex: 1 }} />
              {!last && <TouchableOpacity onPress={onDone} style={s.skip} testID={`${testID}-skip`}><Text style={s.skipTxt}>Skip</Text></TouchableOpacity>}
              <TouchableOpacity onPress={() => (last ? onDone() : setI(i + 1))} style={s.next} testID={`${testID}-next`}>
                <Text style={s.nextTxt}>{last ? 'Got it' : 'Next'}</Text>
                <Ionicons name={last ? 'checkmark' : 'arrow-forward'} size={16} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export async function hasSeenCoachTour(userId: string) {
  try { return !!(await AsyncStorage.getItem(coachTourKey(userId))); } catch { return true; }
}
export async function markCoachTourSeen(userId: string) {
  try { await AsyncStorage.setItem(coachTourKey(userId), COACH_TOUR_VERSION); } catch { /* ignore */ }
}

const s = StyleSheet.create({
  card: { position: 'absolute' },
  cardInner: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  arrow: { position: 'absolute', width: 16, height: 16, backgroundColor: '#FFF', transform: [{ rotate: '45deg' }], zIndex: 2, ...(Platform.OS === 'web' ? {} : {}) },
  head: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: '#1A2332' },
  counter: { fontSize: 12, fontWeight: '700', color: '#90A4AE' },
  body: { marginTop: 10, fontSize: 13, color: '#546E7A', lineHeight: 19 },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CFD8DC' },
  dotOn: { backgroundColor: '#1E88E5', width: 18 },
  skip: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  skipTxt: { fontSize: 13, fontWeight: '700', color: '#78909C' },
  next: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E88E5', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, minHeight: 44 },
  nextTxt: { color: '#FFF', fontWeight: '800', fontSize: 13 },
});
