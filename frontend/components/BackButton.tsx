import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Platform, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

/**
 * Global floating back-button. Soft-halo circular chip used site-wide for a
 * consistent aesthetic. Black chevron-left icon on white fill with a gentle
 * blurred shadow that reads as "floating" above the background.
 *
 * Micro-interaction: press-in spring scale to 0.92 and back on release — gives
 * every back-tap a tactile squish alongside the Haptics Light impulse.
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
  /** Fallback route when there is nothing to pop on the navigation stack
   *  (e.g. after `router.replace`, deep links, or fresh page load on web).
   *  Defaults to the Home / Dashboard tab. */
  fallbackHref?: string;
}

export default function BackButton({
  onPress,
  style,
  color = '#1A2332',
  testID = 'back-button',
  fallbackHref = '/(tabs)/dashboard',
}: BackButtonProps) {
  // Animated scale shared across press-in / press-out. Spring config tuned
  // for a short, quiet squish (not bouncy) so it reads as tactile, not toy-like.
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.92,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 4,
    }).start();
  };

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (onPress) { onPress(); return; }
    // Fall back to a sensible home when there's nothing to pop (e.g. after
    // router.replace or deep-link entry). router.canGoBack() is the
    // expo-router-native check; on web we additionally guard against
    // window.history.length === 1 (fresh tab).
    let canBack = true;
    try {
      // @ts-ignore — expo-router exposes canGoBack on native; on web it's truthy if there is at least one entry behind.
      canBack = typeof router.canGoBack === 'function' ? router.canGoBack() : true;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if ((window.history?.length ?? 0) <= 1) canBack = false;
      }
    } catch { /* ignore — fall through to back */ }
    if (canBack) router.back();
    else router.replace(fallbackHref as any);
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={s.btn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        testID={testID}
        accessibilityLabel="back-button"
        accessibilityRole="button"
        // @ts-ignore RN-Web mapping
        data-testid={testID}
      >
        <Ionicons name="chevron-back" size={34} color={color} style={{ marginLeft: -2 }} />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  btn: {
    // Circular floating chip — white fill with soft halo-style shadow so the
    // button reads as elevated from the grey background even on pure-white
    // screens.
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
