import React from 'react';
import { TouchableOpacity, StyleSheet, Platform, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

/**
 * Global floating back-button. Soft-halo circular chip used site-wide for a
 * consistent aesthetic. Black chevron-left icon on white fill with a gentle
 * blurred shadow that reads as "floating" above the background.
 *
 * Usage:
 *   <BackButton />                         // defaults to router.back()
 *   <BackButton onPress={customHandler} /> // override navigation
 *   <BackButton style={{ top: 40 }} />     // nudge position per-screen
 */
interface BackButtonProps {
  onPress?: () => void;
  style?: ViewStyle;
  color?: string;
  testID?: string;
}

export default function BackButton({
  onPress,
  style,
  color = '#1A2332',
  testID = 'back-button',
}: BackButtonProps) {
  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (onPress) onPress();
    else router.back();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[s.btn, style]}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      activeOpacity={0.7}
      testID={testID}
      accessibilityLabel="back-button"
      accessibilityRole="button"
      // @ts-ignore RN-Web mapping
      data-testid={testID}
    >
      <Ionicons name="chevron-back" size={24} color={color} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    // Circular floating chip — matches the user's reference image: white fill,
    // soft halo-style shadow so the button reads as elevated from the grey
    // background even on pure-white screens.
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    // iOS — wide, soft drop-shadow forms the halo
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    // Android — corresponding elevation
    elevation: 4,
  },
});
