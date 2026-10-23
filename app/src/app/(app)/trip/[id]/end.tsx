import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { rpc, useLoader, type Checklist } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { confirmAction } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { useTrip } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Card, Header, Loading, Row, textStyles } from '@/ui/kit';
import { colors } from '@/ui/theme';

function Check({ ok, title, body, children, last }: { ok: boolean; title: string; body?: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <Row last={last} style={{ alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: ok ? colors.getsSoft : colors.oweSoft }}>
        <Text style={{ fontWeight: '800', color: ok ? colors.gets : colors.owe }}>{ok ? '✓' : '!'}</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={textStyles.strong}>{title}</Text>
        {body ? <Text style={textStyles.muted}>{body}</Text> : null}
        {children}
      </View>
    </Row>
  );
}

// Screen 4.1 (Head only; the server enforces it too).
export default function EndTrip() {
  const t = useTrip();
  const check = useLoader(
    () => (t.tripId ? rpc<Checklist>(supabase.rpc('end_trip_checklist', { p_trip_id: t.tripId })) : Promise.reject({ message: 'NOT_TRIP_MEMBER' })),
    [t.tripId, t.summary?.total_spent, t.summary?.pool.collected]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = check.data;

  const run = async (key: string, fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(key);
    setError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) setError(friendlyError(err));
    check.reload();
    t.reload();
  };

  const end = async () => {
    if (!t.tripId || !c?.can_end) return;
    if (!(await confirmAction('End the trip?', 'No more expenses can be added. Everyone will see how to settle up.', 'End trip'))) return;
    setBusy('end');
    const { error: err } = await supabase.rpc('end_trip', { p_trip_id: t.tripId });
    setBusy(null);
    if (err) return setError(friendlyError(err));
    router.replace(`/trip/${t.tripId}/summary`);
  };

  return (
    <Screen scroll footer={t.isHead ? (
      <>
        <Button title="End trip & calculate split" onPress={end} loading={busy === 'end'} disabled={!c?.can_end} />
        <Text style={[textStyles.sub, { textAlign: 'center' }]}>Only the Head can do this. Everyone is notified.</Text>
      </>
    ) : undefined}>
      <Header title={`End ${t.summary?.trip.name ?? 'trip'}?`} />
      <Text style={textStyles.muted}>Check these before splitting. After ending, expenses can’t be added (the Head can reopen it before anyone pays).</Text>
      {!c ? (check.loading ? <Loading /> : <ErrorText>{check.error}</ErrorText>) : (
        <Card>
          <Check ok title={`${c.confirmed_expense_count} expenses confirmed`} body={`${formatINR(c.confirmed_total)} in total`} />
          {c.pending_expenses.length === 0 ? <Check ok title="No unconfirmed payments" /> : c.pending_expenses.map((e) => (
            <Check key={e.id} ok={false} title="Payment not confirmed" body={`${e.description} · ${formatINR(e.amount)} · added by ${e.created_by_name}`}>
              {t.isHead ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="It was paid" style={{ height: 38, paddingHorizontal: 12 }} loading={busy === e.id}
                    onPress={() => run(e.id, () => supabase.rpc('confirm_expense_payment', { p_expense_id: e.id, p_success: true }))} />
                  <Button title="It failed" variant="secondary" style={{ height: 38, paddingHorizontal: 12 }} disabled={!!busy}
                    onPress={() => run(e.id, () => supabase.rpc('confirm_expense_payment', { p_expense_id: e.id, p_success: false }))} />
                </View>
              ) : null}
            </Check>
          ))}
          {c.pending_contributions.map((p) => (
            <Check key={p.id} ok={false} title="Pool payment waiting for you" body={`${p.full_name} says they paid ${formatINR(p.amount)}`}>
              {t.isHead ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Received" style={{ height: 38, paddingHorizontal: 12 }} loading={busy === p.id}
                    onPress={() => run(p.id, () => supabase.rpc('confirm_pool_contribution', { p_contribution_id: p.id, p_received: true }))} />
                  <Button title="Not received" variant="secondary" style={{ height: 38, paddingHorizontal: 12 }} disabled={!!busy}
                    onPress={() => run(p.id, () => supabase.rpc('confirm_pool_contribution', { p_contribution_id: p.id, p_received: false }))} />
                </View>
              ) : null}
            </Check>
          ))}
          {c.missing_contributions.map((m) => (
            <Check key={m.user_id} ok={false} title={`${m.full_name} hasn’t paid their full pool share`}
              body={`${formatINR(m.missing)} missing. It’s simply added to their final settlement.`} />
          ))}
          <Check last ok title={c.pool_leftover && c.pool_leftover > 0 ? `${formatINR(c.pool_leftover)} left in the pool` : 'Pool is used up'}
            body="Leftover pool money is returned through the settlement, so no separate refunds are needed." />
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}
