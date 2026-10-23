import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { addNotificationResponseListener, registerForPushNotifications } from '@/lib/pushNotifications';
import { SplashView } from '@/ui/SplashView';

function RootNavigator() {
  const { loading, session, profile } = useAuth();
  const router = useRouter();
  const notificationListener = useRef<ReturnType<typeof addNotificationResponseListener> | null>(null);

  // Register for push notifications when onboarded
  useEffect(() => {
    if (profile?.onboarded) {
      registerForPushNotifications();
    }
  }, [profile?.onboarded]);

  // Handle notification taps
  useEffect(() => {
    notificationListener.current = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.trip_id) {
        router.push(`/trip/${data.trip_id}`);
      } else {
        router.push('/notifications');
      }
    });
    return () => notificationListener.current?.remove();
  }, [router]);
  if (loading) return <SplashView />;

  const signedIn = !!session;
  const onboarded = signedIn && !!profile?.onboarded;

  // Route guards: screens outside the active group are unreachable, even via deep links.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="otp" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="profile-setup" />
      </Stack.Protected>
      {/* Every signed-in screen lives in the (app) group, so one guard covers them all. */}
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}
