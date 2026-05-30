/**
 * Compact pill badge surfacing unseen "What's New" changelog entries.
 * Renders nothing when there are zero unseen entries — stays out of the way.
 * Self-refetches on every screen focus so the badge clears the moment the user
 * has read the changelog and returns to the dashboard.
 *
 * Copy is role-aware: when every unseen entry is targeted at the user's role,
 * the badge reads "What's new for {RolePlural} N ›" instead of generic copy.
 */
import React, { useCallback, useState } from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
} from 'react-native-reanimated';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const ROLE_PLURAL: Record<string, string> = {
  student: 'Students',
  supervisor: 'Supervisors',
  implant_incharge: 'In-Charges',
  nurse: 'Nurses',
  administrator: 'Admins',
};

type Entry = { version: string; roles?: string[] | null };

export default function WhatsNewBadge() {
  const router = useRouter();
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [forRolePlural, setForRolePlural] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsnew');
      const entries: Entry[] = data?.entries || [];
      const n = entries.length;
      setCount(n);

      // If every unseen entry is targeted at the user's exact role, surface
      // the role plural so the copy feels personally relevant. Otherwise stay
      // generic — never lie to In-Charges that a Student-only update is theirs.
      const role = (user?.role || '').toLowerCase();
      const everyTargeted =
        n > 0 &&
        !!ROLE_PLURAL[role] &&
        entries.every(e => Array.isArray(e.roles) && e.roles!.includes(role));
      setForRolePlural(everyTargeted ? ROLE_PLURAL[role] : null);

      opacity.value = withTiming(n > 0 ? 1 : 0, { duration: 220 });
      scale.value = n > 0
        ? withSpring(1, { damping: 14, stiffness: 180 })
        : withTiming(0.92, { duration: 180 });
    } catch {
      setCount(0);
      setForRolePlural(null);
      opacity.value = withTiming(0, { duration: 180 });
    }
  }, [user?.role]);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  if (count <= 0) return null;

  const labelSuffix = forRolePlural ? ` for ${forRolePlural}` : '';

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={() => router.push('/whatsnew')}
        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
        data-testid="dashboard-whatsnew-badge"
        accessibilityRole="button"
        accessibilityLabel={`What's new${labelSuffix} — ${count} unread update${count === 1 ? '' : 's'}`}
      >
        <Ionicons name="sparkles" size={12} color="#0D47A1" />
        <Text style={styles.pillText}>
          What's new{labelSuffix} <Text style={styles.pillCount}>{count}</Text>
        </Text>
        <Ionicons name="chevron-forward" size={12} color="#1565C0" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  pillPressed: { backgroundColor: '#BBDEFB' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#0D47A1', letterSpacing: 0.3 },
  pillCount: {
    fontSize: 11, fontWeight: '900', color: '#FFF',
    backgroundColor: '#1565C0',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
    overflow: 'hidden',
  },
});
