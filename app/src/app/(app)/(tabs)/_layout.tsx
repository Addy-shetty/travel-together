import { Tabs } from 'expo-router';
import { HomeIcon, PinIcon, UserIcon, WalletIcon } from '@/ui/icons';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarStyle: { borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarIcon: ({ color }) => <PinIcon color={color} /> }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: ({ color }) => <WalletIcon color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <UserIcon color={color} /> }} />
    </Tabs>
  );
}
