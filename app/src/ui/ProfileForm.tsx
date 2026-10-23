import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { cleanName, isValidEmail, isValidUpiId } from '@/lib/validation';
import { Button, ErrorText, TextField } from './components';

// Shared by onboarding (1.4) and Edit profile (1.8). Writes only the caller's own row;
// RLS + column grants enforce that on the server.
export function ProfileForm({ submitLabel, onSaved }: { submitLabel: string; onSaved?: () => void }) {
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [upi, setUpi] = useState(profile?.upi_id ?? '');
  const [errors, setErrors] = useState<{ name?: string; email?: string; upi?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = {
      name: cleanName(name) ? undefined : 'Enter your name.',
      email: email.trim() === '' || isValidEmail(email) ? undefined : 'Enter a valid email or leave it empty.',
      upi: isValidUpiId(upi) ? undefined : 'Enter a UPI ID like name@okaxis.',
    };
    setErrors(next);
    if (next.name || next.email || next.upi || !session) return;

    setSaving(true);
    setFormError(null);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: cleanName(name), email: email.trim() || null, upi_id: upi.trim() })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    await refreshProfile();
    onSaved?.();
  };

  return (
    <View style={{ gap: 16 }}>
      <TextField label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name"
        maxLength={80} error={errors.name} />
      <TextField label="Email (for trip summaries)" value={email} onChangeText={setEmail} placeholder="you@example.com"
        keyboardType="email-address" autoCapitalize="none" autoComplete="email" maxLength={254} error={errors.email} />
      <TextField label="UPI ID" value={upi} onChangeText={(t) => setUpi(t.replace(/\s/g, ''))} placeholder="name@okaxis"
        autoCapitalize="none" autoCorrect={false} maxLength={320} error={errors.upi}
        hint="Used only so friends can pay you back. We never take money from your account." />
      <ErrorText>{formError}</ErrorText>
      <Button title={submitLabel} onPress={save} loading={saving} />
    </View>
  );
}
