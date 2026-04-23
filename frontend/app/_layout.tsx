import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TabletFrame } from '../components/TabletFrame';

/**
 * ActivityTracker wraps the Stack and captures any touch anywhere in the app to
 * reset the session inactivity timer used by AuthContext.
 */
function ActivityTracker({ children }: { children: React.ReactNode }) {
  const { recordActivity } = useAuth();
  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => { recordActivity(); return false; }}
      onMoveShouldSetResponderCapture={() => { recordActivity(); return false; }}
    >
      {children}
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <TabletFrame>
          <ActivityTracker>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth/login" />
              <Stack.Screen name="auth/register" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="implantlens/index" />
              <Stack.Screen name="implantlens/[caseId]" />
              <Stack.Screen name="procedures/[id]" options={{ headerShown: true, title: 'Case Details', headerBackTitle: 'Back' }} />
              <Stack.Screen name="procedures/submit-phase2/[id]" options={{ headerShown: true, title: 'Phase 2 - Surgical Protocol', headerBackTitle: 'Back' }} />
              <Stack.Screen name="procedures/submit-stage2-surgical/[id]" options={{ headerShown: true, title: 'Phase 3 - Second Stage', headerBackTitle: 'Back' }} />
              <Stack.Screen name="procedures/submit-stage2-prosthetic/[id]" options={{ headerShown: true, title: 'Phase 4 - Prosthesis', headerBackTitle: 'Back' }} />
              <Stack.Screen name="procedures/submit-phase4-step2/[id]" options={{ headerShown: true, title: 'Phase 4 - Final Delivery', headerBackTitle: 'Back' }} />
              <Stack.Screen name="legal/privacy-policy" options={{ headerShown: true, title: 'Privacy Policy', headerBackTitle: 'Back' }} />
              <Stack.Screen name="legal/terms" options={{ headerShown: true, title: 'Terms of Service', headerBackTitle: 'Back' }} />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="help-workflow" />
            </Stack>
          </ActivityTracker>
        </TabletFrame>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
