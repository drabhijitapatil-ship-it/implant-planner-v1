/**
 * iter-406 — zero-dependency cross-platform signature pad.
 * PanResponder + react-native-svg polylines: identical behavior on web
 * preview and native devices (no WebView, no rebuild).
 */
import React, { useRef } from 'react';
import { View, Text, StyleSheet, PanResponder } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';

export type Stroke = number[][]; // [[x,y], ...]

type Props = {
  strokes: Stroke[];
  onChange: (strokes: Stroke[]) => void;
  height?: number;
  testID?: string;
};

export default function SignaturePad({ strokes, onChange, height = 150, testID }: Props) {
  const current = useRef<Stroke>([]);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        const { locationX, locationY } = e.nativeEvent;
        current.current = [[locationX, locationY]];
        onChange([...strokesRef.current, current.current]);
      },
      onPanResponderMove: e => {
        const { locationX, locationY } = e.nativeEvent;
        current.current.push([locationX, locationY]);
        onChange([...strokesRef.current.slice(0, -1), [...current.current]]);
      },
      onPanResponderRelease: () => { current.current = []; },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return (
    <View
      style={[s.pad, { height }]}
      {...pan.panHandlers}
      testID={testID}
      // @ts-ignore RN-Web forwards data-* attrs
      data-testid={testID}
    >
      <Svg width="100%" height="100%" pointerEvents="none">
        {strokes.map((st, i) =>
          st.length === 1 ? (
            <Circle key={i} cx={st[0][0]} cy={st[0][1]} r={1.4} fill="#1A2332" />
          ) : (
            <Polyline
              key={i}
              points={st.map(p => `${p[0]},${p[1]}`).join(' ')}
              fill="none"
              stroke="#1A2332"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        )}
      </Svg>
      {strokes.length === 0 && (
        <View style={s.hintWrap} pointerEvents="none">
          <Text style={s.hint}>Sign here</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pad: {
    width: '100%', borderWidth: 1.5, borderColor: '#B0BEC5', borderStyle: 'dashed',
    borderRadius: 8, backgroundColor: '#FAFCFF', overflow: 'hidden',
    // @ts-ignore web-only: prevent page scroll/select while signing
    touchAction: 'none', userSelect: 'none',
  },
  hintWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  hint: { color: '#CFD8DC', fontSize: 13, fontWeight: '600' },
});
