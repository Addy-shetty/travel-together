import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Settlement } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { useTrip } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { CheckIcon } from '@/ui/icons';
import { Avatar, Card, Header, Loading, Note, Progress, Row, SectionLabel, textStyles } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { UpiPaymentSheet } from '@/ui/UpiPaymentSheet';
import { UpiQrCode } from '@/ui/UpiQrCode';

// Screens 4.3 (settle up) and 4.4 (all settled).
export default function Settle() {
  const t = useTrip();
  const { profile } = useAuth();
  const s = t.summary;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [showingQr, setShowingQr] = useState<string | null>(null);
  if (!s) return <Screen><Header title="Settle up" />{t.loading ? <Loading /> : <ErrorText>{t.error}</ErrorText>}</Screen>;

  const trip = s.trip;
  const all = s.settlements;
  const done = all.filter((x) => x.status === 'confirmed');
  const mine = all.filter((x) => x.from_user === t.me && x.status !== 'confirmed');
  const toMe = all.filter((x) => x.to_user === t.me && x.status !== 'confirmed');
  const others = all.filter((x) => x.from_user !== t.me && x.to_user !== t.me);
  const total = all.reduce((a, x) => a + x.amount, 0);
  const paid = done.reduce((a, x) => a + x.amount, 0);

  const run = async (key: string, fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(key);
    setError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) setError(friendlyError(err));
    t.reload();
  };

  const markPaid = async (x: Settlement, upiRef: string | undefined) => {
    await run(x.id, () => supabase.rpc('mark_settlement_paid', { p_settlement_id: x.id, p_upi_ref: upiRef }));
    setPaying(null);
  };

  if (trip.status === 'settled') {
    return (
      <Screen scroll footer={<>
        <Button title="View trip summary" onPress={() => router.replace(`/trip/${trip.id}/summary`)} />
        <Button title="Plan next trip" variant="secondary" onPress={() => router.replace('/trip/new')} />
      </>}>
        <Header title="" back="close" />
        <View style={{ alignItems: 'center', gap: 12 }}>
          <View style={styles.done}><CheckIcon color="#FFFFFF" size={48} strokeWidth={2.5} /></View>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>All settled!</Text>
          <Text style={[textStyles.muted, { textAlign: 'center' }]}>{trip.name} is closed. Everyone has paid their fair share.</Text>
        </View>
        <Card style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
          {[['Total spent', formatINR(s.total_spent)], ['Per person', formatINR(s.per_person)],
            ['Settled in', `${all.length} payment${all.length === 1 ? '' : 's'}`],
            ['Biggest spend', s.categories[0] ? `${s.categories[0].category} · ${Math.round((s.categories[0].amount / Math.max(s.total_spent, 1)) * 100)}%` : '—']].map(([l, v]) => (
            <View key={l} style={{ width: '50%', gap: 2 }}><Text style={textStyles.sub}>{l}</Text><Text style={[textStyles.strong, { fontSize: 18 }]}>{v}</Text></View>
          ))}
        </Card>
        {all.length ? (
          <Card>{all.map((x, i) => (
            <Row key={x.id} last={i === all.length - 1}>
              <Text style={[textStyles.body, { flex: 1 }]}>{x.from_name} → {x.to_name}</Text>
              <Text style={[textStyles.amount, textStyles.gets]}>{formatINR(x.amount)} ✓</Text>
            </Row>
          ))}</Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen scroll refreshing={t.loading} onRefresh={t.reload}>
      <Header title="Settle up" subtitle={trip.name} />
      <Card style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={textStyles.strong}>{done.length} of {all.length} payments done</Text>
          <Text style={textStyles.muted}>{formatINR(paid)} of {formatINR(total)}</Text>
        </View>
        <Progress value={total ? paid / total : 1} color={colors.gets} />
        <Text style={textStyles.sub}>Reduced to the fewest payments. Leftover pool money is already counted in.</Text>
      </Card>
      <ErrorText>{error}</ErrorText>

      {mine.length ? <SectionLabel>You pay</SectionLabel> : null}
      {mine.length ? (
        <Card style={{ borderColor: colors.owe, borderWidth: 1.5 }}>
          {mine.map((x, i) => (
            <Row key={x.id} last={i === mine.length - 1}>
              <Avatar name={x.to_name} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={textStyles.strong}>To {x.to_name}</Text>
                <Text style={textStyles.sub}>{x.status === 'paid' ? `Waiting for ${x.to_name} to confirm` : x.to_upi_id ?? 'No UPI ID'}</Text>
              </View>
              <Text style={textStyles.amount}>{formatINR(x.amount)}</Text>
              {x.status === 'pending' && paying !== x.id ? (
                <Button title="Pay" style={{ height: 40, paddingHorizontal: 14 }} loading={busy === x.id}
                  onPress={() => (x.to_upi_id ? setPaying(x.id) : setError(`${x.to_name} hasn't added a UPI ID yet.`))} />
              ) : null}
            </Row>
          ))}
        </Card>
      ) : null}
      {mine.filter((x) => x.id === paying && x.to_upi_id).map((x) => (
        <UpiPaymentSheet key={x.id} payeeUpi={x.to_upi_id!} payeeName={x.to_name} amountPaise={x.amount} note={`TT-settle-${x.id.slice(0, 8)}`}
          onPaid={(ref) => markPaid(x, ref)} />
      ))}

      {toMe.length ? <SectionLabel>You receive</SectionLabel> : null}
      {toMe.map((x) => (
        <Card key={x.id} style={{ padding: 14, gap: 10 }}>
          <Text style={textStyles.body}>
            <Text style={textStyles.strong}>{x.from_name}</Text> pays you <Text style={textStyles.strong}>{formatINR(x.amount)}</Text>
            {x.status === 'paid' ? " and says it's done. Did you receive it?" : '. Confirm here once it arrives (UPI or cash).'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Yes, received" style={{ flex: 1, height: 44 }} loading={busy === `c-${x.id}`}
              onPress={() => run(`c-${x.id}`, () => supabase.rpc('confirm_settlement', { p_settlement_id: x.id, p_received: true }))} />
            {x.status === 'paid' ? (
              <Button title="Not received" variant="secondary" style={{ flex: 1, height: 44 }} disabled={!!busy}
                onPress={() => run(`n-${x.id}`, () => supabase.rpc('confirm_settlement', { p_settlement_id: x.id, p_received: false }))} />
            ) : (
              <Button title="Remind" variant="secondary" style={{ flex: 1, height: 44 }} loading={busy === `r-${x.id}`}
                onPress={() => run(`r-${x.id}`, () => supabase.rpc('send_reminder', { p_trip_id: trip.id, p_user_id: x.from_user, p_kind: 'settlement' }))} />
            )}
          </View>
          {x.status !== 'paid' && profile?.upi_id ? (
            <Button
              title={showingQr === x.id ? 'Hide QR' : 'Show my QR'}
              variant="ghost"
              style={{ height: 40 }}
              onPress={() => setShowingQr(showingQr === x.id ? null : x.id)}
            />
          ) : null}
        </Card>
      ))}
      {toMe.filter((x) => x.id === showingQr && profile?.upi_id).map((x) => (
        <UpiQrCode
          key={`qr-${x.id}`}
          payeeUpi={profile!.upi_id!}
          payeeName={profile!.full_name ?? 'Me'}
          amountPaise={x.amount}
          note={`TT-settle-${x.id.slice(0, 8)}`}
        />
      ))}

      {others.length ? <SectionLabel>Between others</SectionLabel> : null}
      {others.length ? (
        <Card>
          {others.map((x, i) => (
            <Row key={x.id} last={i === others.length - 1}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={textStyles.strong}>{x.from_name} → {x.to_name}</Text>
                <Text style={[textStyles.sub, x.status === 'confirmed' ? { color: colors.gets, fontWeight: '700' } : { color: colors.owe, fontWeight: '600' }]}>
                  {x.status === 'confirmed' ? `Paid · confirmed by ${x.to_name}` : x.status === 'paid' ? `Paid · waiting for ${x.to_name}` : 'Pending'}
                </Text>
              </View>
              <Text style={[textStyles.amount, x.status === 'confirmed' && { color: colors.muted, textDecorationLine: 'line-through' }]}>{formatINR(x.amount)}</Text>
            </Row>
          ))}
        </Card>
      ) : null}

      {all.length === 0 ? <Note>Everyone is even. Nothing to settle.</Note>
        : <Note>A payment counts once the person receiving it confirms. The trip closes on its own when all are done.</Note>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  done: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
