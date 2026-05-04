/**
 * iter-157 — Reusable iOS-style centered navigation bar.
 *
 * Layout:
 *   [BackButton(44×44)]  [   centered title / subtitle   ]  [right action or 44-px spacer]
 *
 * When `rightAction` is omitted, a 44×44 invisible spacer is inserted on the
 * right to keep the title block precisely centered under the screen.
 *
 * Used by:
 *   • /admin/implant-catalog        (iter-156, built inline — kept inline)
 *   • /admin/implant-compare        (iter-157)
 *   • /admin/implant-catalog-edit   (iter-157)
 *   • /ask-implanr                  (iter-157)
 *   • /admin/audit-log              (iter-157, two right icons)
 */
import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import BackButton from './BackButton';

interface Props {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;       // single node — usually a TouchableOpacity icon
  fallback?: string;                    // fallback route if back-stack is empty
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const CenteredHeader: React.FC<Props> = ({
  title, subtitle, rightAction, fallback, style, testID,
}) => (
  <View style={[s.bar, style]} testID={testID}>
    <BackButton fallback={fallback} />
    <View style={s.titleBlock}>
      <Text style={s.title} numberOfLines={1}>{title}</Text>
      {!!subtitle && <Text style={s.sub} numberOfLines={1}>{subtitle}</Text>}
    </View>
    {rightAction
      ? <View style={s.rightSlot}>{rightAction}</View>
      : <View style={s.spacer} />}
  </View>
);

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFF1',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20, fontWeight: '800', color: '#01579B',
    lineHeight: 24, textAlign: 'center',
  },
  sub: {
    fontSize: 12, color: '#607D8B',
    lineHeight: 14, textAlign: 'center', marginTop: 1,
  },
  rightSlot: {
    minWidth: 44, minHeight: 44,
    alignItems: 'flex-end', justifyContent: 'center',
  },
  spacer: { width: 44, height: 44 },
});

export default CenteredHeader;
