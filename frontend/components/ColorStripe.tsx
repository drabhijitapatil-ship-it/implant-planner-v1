/**
 * Animated color stripe for implant-system rows (iter-286, Feb 2026).
 *
 * - Renders a 4-px rounded band in the brand colour resolved via
 *   `getImplantColor()`.
 * - When the parent row is pressed/hovered/focused the stripe widens to
 *   6 px and ramps a brand-tinted glow over 200ms. Release fades it out.
 * - Uses `pointerEvents="none"` so it never intercepts the row click.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

import { getImplantColor } from '../constants/implantColors';

type Props = {
  brand: string;
  system: string;
  diameter?: number | null;
  /** Parent-driven press state — drives the slide-in glow. */
  active?: boolean;
  dimmed?: boolean;
  testID?: string;
};

export default function ColorStripe({
  brand,
  system,
  diameter,
  active,
  dimmed,
  testID,
}: Props) {
  const stripe = getImplantColor(brand, system, diameter);
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(glow, {
      toValue: active ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [active, glow]);

  const width = glow.interpolate({ inputRange: [0, 1], outputRange: [4, 6] });
  const shadowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] });

  return (
    <View
      style={{ width: 6, alignSelf: 'stretch', justifyContent: 'center', marginRight: 10 }}
      pointerEvents="none"
      accessibilityLabel={`Color band: ${stripe.label}`}
      data-testid={testID}
    >
      <Animated.View
        style={{
          width,
          alignSelf: 'flex-start',
          flexGrow: 1,
          borderRadius: 3,
          backgroundColor: stripe.fill,
          opacity: dimmed ? 0.35 : 1,
          shadowColor: stripe.fill,
          shadowOpacity,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}
