import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import ImplantIcon from './ImplantIcon';

/**
 * JS-rendered splash screen shown right after the native splash (app.json's
 * expo-splash-screen config — static image only) hides. Gives us a fully
 * custom, animatable screen instead of a static image — logo pop-in, pulsing
 * ring, and a tagline. Fades out via the `visible` prop once the app
 * (auth check, fonts, etc.) is ready.
 */
export default function CustomSplashScreen({ visible }: { visible: boolean }) {
  const fade = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;
  const dismissed = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, { toValue: 1.55, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ringScale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, { toValue: 0, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (visible || dismissed.current) return;
    dismissed.current = true;
    Animated.timing(fade, {
      toValue: 0,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.container, { opacity: fade }]}
    >
      <View style={styles.logoWrap}>
        <Animated.View
          style={[
            styles.ring,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <Animated.View
          style={{
            opacity: logoOpacity,
            transform: [{ scale: logoScale }],
          }}
        >
          <View style={styles.logoCircle}>
            <ImplantIcon size={48} color="#1E88E5" />
          </View>
        </Animated.View>
      </View>

      <Animated.Text style={[styles.title, { opacity: logoOpacity }]}>Implanr</Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: logoOpacity }]}>
        Implant Planning, Simplified
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  logoWrap: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ring: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: '#1E88E5',
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A2332',
    letterSpacing: 0.4,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: '#78909C',
    marginTop: 6,
    letterSpacing: 0.2,
  },
});
