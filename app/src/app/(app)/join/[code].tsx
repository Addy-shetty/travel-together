import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { rpc, useLoader, type InvitePreview } from '@/lib/api';
import { dateRange } from '@/lib/dates';
import { INVITE_CODE } from '@/lib/deepLinks';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Avatar, Card, Header, Loading, Row, textStyles } from '@/ui/kit';

const MODE = { pool: 'Shared pool', each_pays: 'Each pays & logs', both: 'Pool + each pays' } as const;

// Screen 2.4. Reached from the Trips tab or an invite link (already sanitised by +native-intent).
export default function JoinTrip() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' && INVITE_CODE.test(params.code.toUpperCase()) ? params.code.toUpperCase() : null;
  const { data, error, loading } = useLoader(
    () => (code ? rpc<InvitePreview>(supabase.rpc('get_trip_invite', { p_invite_code: code })) : Promise.reject({ message: 'INVITE_NOT_FOUND' })),
    [code]);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const join = async () => {
    if (!code || !data) return;
    setJoining(true);
    setJoinError(null);
    const { data: tripId, error: err } = await supabase.rpc('join_trip', { p_invite_code: code });
    setJoining(false);
    if (err || !tripId) {
      setJoinError(friendlyError(err));
      return;
    }
    const needsShare = data.money_mode !== 'each_pays' && data.pool_amount_per_person > 0;
    router.replace(needsShare ? `/trip/${tripId}/pay-share` : `/trip/${tripId}`);
  };

  return (
    <Screen scroll footer={data ? (
      data.already_member
        ? <Button title="Open trip" onPress={() => router.replace(`/trip/${data.trip_id}`)} />
        : <>
            <Button title="Join trip" onPress={join} loading={joining} />
            <Button title="Not now" variant="ghost" onPress={() => router.back()} />
          </>
    ) : undefined}>
      <Header title="Join trip" back="close" />
      {loading ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <View style={{ gap: 4 }}>
            <Text style={textStyles.muted}><Text style={textStyles.strong}>{data.head.full_name}</Text> invited you to</Text>
            <Text style={{ fontSize: 30, fontWeight: '800' }}>{data.name}</Text>
            <Text style={textStyles.muted}>{dateRange(data.start_date, data.end_date)}</Text>
          </View>
          <Card style={{ padding: 16, gap: 12 }}>
            <Text style={textStyles.strong}>Who’s going · {data.members.length}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {data.members.map((m) => (
                <View key={m.id} style={{ alignItems: 'center', gap: 4, width: 56 }}>
                  <Avatar name={m.full_name} size={48} strong={m.role === 'head'} />
                  <Text style={textStyles.sub} numberOfLines={1}>{m.role === 'head' ? 'Head' : m.full_name.split(' ')[0]}</Text>
                </View>
              ))}
            </View>
          </Card>
          <Card>
            <Row><Text style={[textStyles.muted, { flex: 1 }]}>Money mode</Text><Text style={textStyles.strong}>{MODE[data.money_mode]}</Text></Row>
            {data.money_mode !== 'each_pays' ? (
              <>
                <Row><Text style={[textStyles.muted, { flex: 1 }]}>Your pool share</Text><Text style={textStyles.strong}>{formatINR(data.pool_amount_per_person)}</Text></Row>
                <Row><Text style={[textStyles.muted, { flex: 1 }]}>Collected by</Text><Text style={textStyles.strong} numberOfLines={1}>{data.head.full_name} · {data.pool_upi_id}</Text></Row>
              </>
            ) : null}
            <Row last><Text style={[textStyles.muted, { flex: 1 }]}>Default split</Text><Text style={textStyles.strong}>Equally</Text></Row>
          </Card>
          <Text style={textStyles.sub}>
            By joining, you’ll see every expense in this trip and share costs that include you. You can leave before you spend anything.
          </Text>
          <ErrorText>{joinError}</ErrorText>
        </>
      ) : null}
    </Screen>
  );
}
