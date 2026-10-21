import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TabletFrame } from '../components/TabletFrame';
import AttachPickerModalRoot from '../components/AttachPickerModal';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <TabletFrame>
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
              <Stack.Screen name="admin/backfill-timeline" options={{ headerShown: false }} />
              <Stack.Screen name="admin/survival-analytics" options={{ headerShown: false }} />
              <Stack.Screen name="analytics/procedure-overview" options={{ headerShown: false }} />
              <Stack.Screen name="analytics/advanced" options={{ headerShown: false }} />
              <Stack.Screen name="analytics/guide" options={{ headerShown: false }} />
              <Stack.Screen name="procedures/survival-review/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="procedures/consent-sign/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="admin/implant-catalog" options={{ headerShown: false }} />
              <Stack.Screen name="admin/implant-catalog-edit" options={{ headerShown: false }} />
              <Stack.Screen name="admin/implant-compare" options={{ headerShown: false }} />
              <Stack.Screen name="ask-implanr" options={{ headerShown: false }} />
              <Stack.Screen name="admin/student/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="admin/supervisor/[id]" options={{ headerShown: false }} />
              <Stack.Screen name="forum/index" options={{ headerShown: false }} />
              <Stack.Screen name="forum/[threadId]" options={{ headerShown: false }} />
              <Stack.Screen name="forum/chat/index" options={{ headerShown: false }} />
              <Stack.Screen name="forum/chat/create" options={{ headerShown: false }} />
              <Stack.Screen name="forum/chat/[groupId]" options={{ headerShown: false }} />
              <Stack.Screen name="research/index" options={{ headerShown: false }} />
              <Stack.Screen name="research/new" options={{ headerShown: false }} />
              <Stack.Screen name="research/guide" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/index" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/eligibility" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/variables" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/schedule" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/ethics" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/team" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/screening" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/results" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/queries" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/synopsis" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/blind-queue" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/amendments" options={{ headerShown: false }} />
              <Stack.Screen name="research/[id]/audit" options={{ headerShown: false }} />
              <Stack.Screen name="research/inclusion/[rid]" options={{ headerShown: false }} />
              <Stack.Screen name="research/enrolment/[eid]" options={{ headerShown: false }} />
            </Stack>
            <AttachPickerModalRoot />
        </TabletFrame>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
