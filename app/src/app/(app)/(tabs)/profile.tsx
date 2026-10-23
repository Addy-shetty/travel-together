import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { rpc, useLoader, type Overview, type SplitMethod } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { confirmAction } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { formatIndianMobile } from '@/lib/validation';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Avatar, Card, Chip, Header, Row, SectionLabel, textStyles } from '@/ui/kit';
import { colors } from '@/ui/theme';

type Editable = { notifications_enabled?: boolean; location_enabled?: boolean; default_split?: SplitMethod;
  preferred_upi_app?: 'gpay' | 'phonepe' | 'paytm' | 'bhim' | 'other' };

// Screen 1.8.
export default function Profile() {
  const { session, profile, refreshProfile, signOut } = useAuth();
  const { data } = useLoader(() => rpc<Overview>(supabase.rpc('my_overview')), []);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { refreshProfile(); }, [refreshProfile]));

  const update = async (patch: Editable) => {
    if (!session) return;
    setError(null);
    const { error: err } = await supabase.from('profiles').update(patch).eq('id', session.user.id);
    if (err) setError(friendlyError(err));
    await refreshProfile();
  };

  const logout = async () => {
    if (await confirmAction('Log out?', 'You’ll need an OTP to sign in again.', 'Log out', true)) await signOut();
  };

  if (!profile) return null;
  return (
    <Screen scroll edges={['top']}>
      <Header title="Profile" back={false} />
      <Card style={{ padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Avatar name={profile.full_name} size={60} strong />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[textStyles.strong, { fontSize: 17 }]}>{profile.full_name}</Text>
          {profile.phone ? <Text style={textStyles.muted}>{formatIndianMobile(profile.phone.startsWith('+') ? profile.phone : `+${profile.phone}`)}</Text> : null}
          <Text style={textStyles.muted}>{profile.upi_id}</Text>
        </View>
        <Button title="Edit" variant="secondary" onPress={() => router.push('/edit-profile')} style={{ height: 40 }} />
      </Card>

      {data ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[[String(data.stats.trips), 'Trips'], [String(data.stats.friends), 'Friends'], [formatINR(data.stats.total_spent), 'My share']].map(([v, l]) => (
            <Card key={l} style={{ flex: 1, padding: 12, alignItems: 'center', gap: 2 }}>
              <Text style={[textStyles.strong, { fontSize: 18 }]} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
              <Text style={textStyles.sub}>{l}</Text>
            </Card>
          ))}
        </View>
      ) : null}

      <SectionLabel>Payments</SectionLabel>
      <Card style={{ padding: 16, gap: 10 }}>
        <Text style={textStyles.strong}>Preferred UPI app</Text>
        <View style={styles.chips}>
          {(['gpay', 'phonepe', 'paytm', 'bhim'] as const).map((k) => (
            <Chip key={k} label={{ gpay: 'GPay', phonepe: 'PhonePe', paytm: 'Paytm', bhim: 'BHIM' }[k]}
              active={profile.preferred_upi_app === k} onPress={() => update({ preferred_upi_app: k })} />
          ))}
        </View>
        <Text style={[textStyles.strong, { marginTop: 6 }]}>Default split for new trips</Text>
        <View style={styles.chips}>
          {(['equal', 'shares', 'exact'] as const).map((k) => (
            <Chip key={k} label={{ equal: 'Equally', shares: 'Shares', exact: 'Exact ₹' }[k]}
              active={profile.default_split === k} onPress={() => update({ default_split: k })} />
          ))}
        </View>
      </Card>

      <SectionLabel>App</SectionLabel>
      <Card>
        <Row>
          <Text style={[textStyles.body, { flex: 1 }]}>Notifications</Text>
          <Switch value={profile.notifications_enabled} onValueChange={(v) => update({ notifications_enabled: v })}
            trackColor={{ true: colors.primary }} accessibilityLabel="Notifications" />
        </Row>
        <Row last>
          <Text style={[textStyles.body, { flex: 1 }]}>Location tagging</Text>
          <Switch value={profile.location_enabled} onValueChange={(v) => update({ location_enabled: v })}
            trackColor={{ true: colors.primary }} accessibilityLabel="Location tagging" />
        </Row>
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button title="Log out" variant="secondary" onPress={logout} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
