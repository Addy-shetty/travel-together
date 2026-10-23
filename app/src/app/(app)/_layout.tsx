import { Stack } from 'expo-router';

// Reachable only when signed in and onboarded (guard in src/app/_layout.tsx).
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
