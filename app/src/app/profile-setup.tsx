import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Screen } from '@/ui/components';
import { ProfileForm } from '@/ui/ProfileForm';
import { colors, type } from '@/ui/theme';

// Screen 1.4. Saving makes profiles.onboarded true, and the route guard opens Home.
export default function ProfileSetup() {
  const { signOut } = useAuth();
  return (
    <Screen scroll>
      <View style={styles.steps} accessibilityLabel="Step 2 of 2">
        <View style={styles.step} /><View style={styles.step} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={type.title}>Set up your profile</Text>
        <Text style={styles.body}>Friends see this when you travel together.</Text>
      </View>
      <ProfileForm submitLabel="Let's go" />
      <Button title="Use a different number" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 5, borderRadius: 99, backgroundColor: colors.primary },
  body: { fontSize: 15, color: colors.muted, lineHeight: 22 },
});
