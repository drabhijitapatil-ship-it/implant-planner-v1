import { Stack } from 'expo-router';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TabletFrame } from '../components/TabletFrame';
import { useScreenCaptureProtection } from '../hooks/useScreenCaptureProtection';
import AttachPickerModalRoot from '../components/AttachPickerModal';

/**
 * ActivityTracker wraps the Stack and captures any touch anywhere in the app to
 * reset the session inactivity timer used by AuthContext. Also enables the
 * HIPAA screen-capture guard (FLAG_SECURE on Android / preventScreenCapture on
 * iOS) while the user is authenticated.
 */
function ActivityTracker({ children }: { children: React.ReactNode }) {
  const { recordActivity, user } = useAuth();
  useScreenCaptureProtection(!!user);
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
              <Stack.Screen name="procedures/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="procedures/submit-phase2/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="procedures/submit-stage2-surgical/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="procedures/submit-stage2-prosthetic/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="procedures/submit-phase4-step2/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="legal/privacy-policy" options={{ headerShown: false }} />
              <Stack.Screen name="legal/terms" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="help-workflow" />
              <Stack.Screen name="whatsnew" />
              <Stack.Screen name="admin/audit-log" options={{ headerShown: false }} />
              <Stack.Screen name="admin/student/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="admin/supervisor/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="forum/index" options={{ headerShown: false }} />
              <Stack.Screen name="forum/[threadId]" options={{ headerShown: false }} />
              <Stack.Screen name="forum/chat/index" options={{ headerShown: false }} />
              <Stack.Screen name="forum/chat/create" options={{ headerShown: false }} />
              <Stack.Screen name="forum/chat/[groupId]" options={{ headerShown: false }} />
            </Stack>
            <AttachPickerModalRoot />
          </ActivityTracker>
        </TabletFrame>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
