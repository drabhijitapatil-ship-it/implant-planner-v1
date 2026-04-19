import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
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
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
