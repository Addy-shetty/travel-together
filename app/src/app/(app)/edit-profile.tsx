import { router } from 'expo-router';
import { Screen } from '@/ui/components';
import { Header } from '@/ui/kit';
import { ProfileForm } from '@/ui/ProfileForm';

export default function EditProfile() {
  return (
    <Screen scroll>
      <Header title="Edit profile" />
      <ProfileForm submitLabel="Save changes" onSaved={() => router.back()} />
    </Screen>
  );
}
