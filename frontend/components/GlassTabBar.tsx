/**
 * Floating "glass" bottom tab bar. Drawn by hand (passed as `tabBar` to the
 * Tabs navigator) so every tab gets the same layout — the stock bar renders
 * `href` tabs through a Link with different styling, which left them at a
 * different height — and so the active pill can sit cleanly inside the bar.
 *
 * Content scrolls behind it: tab screens end their lists with
 * TAB_BAR_CLEARANCE so the last item still stops above the bar.
 */
import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { Keyframe, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export const GLASS_BAR_HEIGHT = 70;
const BAR_PADDING = 6;
const PILL_HEIGHT = GLASS_BAR_HEIGHT - 12;
const PILL_MAX_WIDTH = 88;
const ACTIVE = '#1565C0';
const INACTIVE = '#8E8E93';

// One highlight that slides to the tapped tab, overshooting a little
// before it settles; the new tab's icon gives a small hop as it arrives.
const SLIDE_SPRING = { damping: 24, stiffness: 220, mass: 0.8 };
const ICON_HOP = new Keyframe({
  0: { transform: [{ translateY: 0 }, { scale: 1 }] },
  40: { transform: [{ translateY: -4 }, { scale: 1.12 }] },
  70: { transform: [{ translateY: 1 }, { scale: 0.96 }] },
  100: { transform: [{ translateY: 0 }, { scale: 1 }] },
}).duration(420);

export default function GlassTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);

  // `href: null` tabs are hidden by expo-router via tabBarItemStyle display none.
  const visible = state.routes
    .map((route, index) => ({ route, index }))
    .filter(({ route }) => (descriptors[route.key].options.tabBarItemStyle as any)?.display !== 'none');
  const activeSlot = Math.max(0, visible.findIndex(v => v.index === state.index));

  // Measured width includes the 1-px border on each side.
  const itemWidth = visible.length && barWidth ? (barWidth - 2 - BAR_PADDING * 2) / visible.length : 0;
  const pillWidth = Math.min(PILL_MAX_WIDTH, Math.max(0, itemWidth - 4));
  const targetX = BAR_PADDING + activeSlot * itemWidth + (itemWidth - pillWidth) / 2;

  const x = useSharedValue(targetX);
  const placed = useSharedValue(0);
  useEffect(() => {
    if (!itemWidth) return;
    // First placement jumps straight there; later tab changes slide.
    if (placed.value) x.value = withSpring(targetX, SLIDE_SPRING);
    else { x.value = targetX; placed.value = 1; }
  }, [targetX, itemWidth]);
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // Screens that hide the bar (New Case form, Users) set tabBarStyle display none.
  const focusedOptions = descriptors[state.routes[state.index].key]?.options;
  if ((focusedOptions?.tabBarStyle as any)?.display === 'none') return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar} onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}>
        <View style={[StyleSheet.absoluteFill, styles.clip]}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 30}
            tint="light"
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.35)' }]} />
        </View>

        {itemWidth > 0 && (
          <Animated.View pointerEvents="none" style={[styles.pill, { width: pillWidth }, pillStyle]} />
        )}

        {visible.map(({ route, index }) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;
          const color = focused ? ACTIVE : INACTIVE;
          const label = typeof options.title === 'string' ? options.title : route.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={styles.item}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              testID={`tab-${route.name}`}
            >
              <Animated.View
                key={focused ? 'on' : 'off'}
                entering={focused ? ICON_HOP : undefined}
                style={styles.icon}
              >
                {options.tabBarIcon?.({ focused, color, size: 22 })}
              </Animated.View>
              <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 14, right: 14 },
  bar: {
    height: GLASS_BAR_HEIGHT,
    borderRadius: GLASS_BAR_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: BAR_PADDING,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
  },
  clip: { borderRadius: GLASS_BAR_HEIGHT / 2, overflow: 'hidden' },
  item: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  pill: {
    position: 'absolute',
    left: 0,
    top: (GLASS_BAR_HEIGHT - PILL_HEIGHT) / 2 - 1,
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    backgroundColor: 'rgba(21,101,192,0.13)',
  },
  icon: { height: 22, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
