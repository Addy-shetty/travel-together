import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { rpc, useLoader } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { confirmAction } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { useTrip } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Avatar, Card, Header, Loading, Note, Progress, Row, SectionLabel, textStyles } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';

type Pending = { id: string; user_id: string; amount: number; created_at: string };

// Screen 2.3 (Head view) and the member view of the same list.
export default function Members() {
  const t = useTrip();
  const s = t.summary;
  const pending = useLoader(
    () => (t.tripId ? rpc<Pending[]>(supabase.from('pool_contributions').select('id, user_id, amount, created_at')
      .eq('trip_id', t.tripId).eq('status', 'pending').order('created_at')) : Promise.resolve([])),
    [t.tripId, s?.pool.collected, s?.members.length]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!s) return <Screen><Header title="Members & pool" />{t.loading ? <Loading /> : <ErrorText>{t.error}</ErrorText>}</Screen>;
  const trip = s.trip;
  const usesPool = trip.money_mode !== 'each_pays' && trip.pool_amount_per_person > 0;
  const me = s.members.find((m) => m.user_id === t.me);
  const myMissing = usesPool && me ? Math.max(trip.pool_amount_per_person - me.contributed, 0) : 0;

  const run = async (key: string, fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(key);
    setError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) setError(friendlyError(err));
    t.reload();
    pending.reload();
  };

  const share = () => Share.share({
    message: `Join my trip "${trip.name}" on Travel-Together.\nInvite code: ${trip.invite_code}\ntraveltogether://join/${trip.invite_code}`,
  });

  const leave = async () => {
    if (!t.tripId) return;
    if (await confirmAction('Leave this trip?', 'You can only leave before you’ve spent anything.', 'Leave', true)) {
      await run('leave', () => supabase.rpc('leave_trip', { p_trip_id: t.tripId! }));
      router.replace('/');
    }
  };

  return (
    <Screen scroll refreshing={t.loading} onRefresh={t.reload}
      footer={myMissing > 0 && t.isActive
        ? <Button title={`Pay my share ${formatINR(myMissing)}`} onPress={() => router.push(`/trip/${trip.id}/pay-share`)} />
        : <Button title="Go to trip" variant="secondary" onPress={() => router.replace(`/trip/${trip.id}`)} />}>
      <Header title="Members & pool" subtitle={trip.name} />
      <ErrorText>{error}</ErrorText>

      {t.isActive ? (
        <Card style={{ padding: 16, gap: 10 }}>
          <Text style={textStyles.strong}>Invite to {trip.name}</Text>
          <Text style={styles.code} accessibilityLabel={`Invite code ${trip.invite_code.split('').join(' ')}`} selectable>{trip.invite_code}</Text>
          <Text style={textStyles.sub}>Friends enter this code in Trips → Join, or open the link you share.</Text>
          <Button title="Share invite" onPress={share} style={{ height: 46 }} />
        </Card>
      ) : null}

      {usesPool ? (
        <Card style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={textStyles.strong}>Pool collected</Text>
            <Text style={textStyles.body}><Text style={textStyles.strong}>{formatINR(s.pool.collected)}</Text> of {formatINR(s.pool.target)}</Text>
          </View>
          <Progress value={s.pool.target ? s.pool.collected / s.pool.target : 0} />
        </Card>
      ) : null}

      {t.isHead && (pending.data?.length ?? 0) > 0 ? (
        <>
          <SectionLabel>Confirm payments to you</SectionLabel>
          {pending.data!.map((p) => (
            <Card key={p.id} style={{ padding: 14, gap: 10, borderColor: colors.owe, borderWidth: 1.5 }}>
              <Text style={textStyles.body}>
                <Text style={textStyles.strong}>{t.nameOf(p.user_id)}</Text> says they paid {formatINR(p.amount)} into the pool. Did you receive it?
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Yes, received" style={{ flex: 1, height: 44 }} loading={busy === p.id}
                  onPress={() => run(p.id, () => supabase.rpc('confirm_pool_contribution', { p_contribution_id: p.id, p_received: true }))} />
                <Button title="Not received" variant="secondary" style={{ flex: 1, height: 44 }} disabled={busy === p.id}
                  onPress={() => run(p.id, () => supabase.rpc('confirm_pool_contribution', { p_contribution_id: p.id, p_received: false }))} />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionLabel>{`Members · ${s.member_count}`}</SectionLabel>
      <Card>
        {s.members.map((m, i) => {
          const missing = usesPool ? Math.max(trip.pool_amount_per_person - m.contributed, 0) : 0;
          const waiting = pending.data?.some((p) => p.user_id === m.user_id);
          return (
            <Row key={m.user_id} last={i === s.members.length - 1}>
              <Avatar name={m.full_name} strong={m.role === 'head'} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={textStyles.strong}>{m.user_id === t.me ? `${m.full_name} (you)` : m.full_name}</Text>
                {m.role === 'head' ? <Text style={[textStyles.sub, { color: colors.primary, fontWeight: '700' }]}>HEAD</Text> : null}
                {usesPool && missing > 0 ? (
                  <Text style={[textStyles.sub, { color: colors.owe, fontWeight: '600' }]}>
                    {waiting ? 'Payment waiting for confirmation' : m.contributed ? `${formatINR(m.contributed)} of ${formatINR(trip.pool_amount_per_person)}` : 'Not paid yet'}
                  </Text>
                ) : null}
              </View>
              {usesPool && missing === 0 ? <Text style={[textStyles.amount, textStyles.gets]}>{formatINR(m.contributed)} ✓</Text> : null}
              {usesPool && missing > 0 && t.isHead && t.isActive && m.user_id !== t.me && !waiting ? (
                <Button title="Remind" variant="secondary" style={{ height: 36, paddingHorizontal: 12 }} loading={busy === `r-${m.user_id}`}
                  onPress={() => run(`r-${m.user_id}`, () => supabase.rpc('send_reminder', { p_trip_id: trip.id, p_user_id: m.user_id, p_kind: 'pool' }))} />
              ) : null}
            </Row>
          );
        })}
      </Card>

      {usesPool ? <Note tone="warn">Members pay their share to the Head over UPI. A payment counts once the Head confirms they received it.</Note> : null}
      {!t.isHead && t.isActive ? <Button title="Leave trip" variant="ghost" onPress={leave} loading={busy === 'leave'} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontSize: 30, fontWeight: '800', letterSpacing: 2, color: colors.primary, backgroundColor: colors.primarySoft,
    borderRadius: radius.md, paddingVertical: 10, textAlign: 'center' },
});
