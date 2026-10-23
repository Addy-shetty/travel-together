import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatINR, paiseToInput, parseRupees } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { useTrip } from '@/lib/useTrip';
import { Button, ErrorText, Screen, TextField } from '@/ui/components';
import { Card, Chip, Header, Loading, Note, Progress, Row, textStyles } from '@/ui/kit';
import { UpiPaymentSheet } from '@/ui/UpiPaymentSheet';

// Screen 2.5. The payee is the trip's pool UPI ID from the server, never typed by the user.
export default function PayShare() {
  const t = useTrip();
  const { profile } = useAuth();
  const s = t.summary;
  const me = s?.members.find((m) => m.user_id === t.me);
  const missing = s && me ? Math.max(s.trip.pool_amount_per_person - me.contributed, 0) : 0;
  const [amountText, setAmountText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!s) return <Screen><Header title="Pay my share" />{t.loading ? <Loading /> : <ErrorText>{t.error}</ErrorText>}</Screen>;
  const trip = s.trip;
  const headName = s.members.find((m) => m.user_id === trip.head_id)?.full_name ?? 'the Head';
  const text = amountText ?? (missing ? paiseToInput(missing) : '');
  const amount = parseRupees(text);

  const record = async (upiApp: string | undefined, upiRef?: string) => {
    if (!amount || !t.tripId) return;
    const { error: err } = await supabase.rpc('record_pool_contribution', {
      p_trip_id: t.tripId, p_amount: amount, p_upi_app: upiApp, p_upi_ref: upiRef,
    });
    if (err) {
      setError(friendlyError(err));
      return;
    }
    router.replace(`/trip/${trip.id}`);
  };

  const recordHeadShare = async () => {
    if (!amount) return setError('Enter an amount.');
    setBusy(true);
    await record(undefined); // the Head's share is already in their own account
    setBusy(false);
  };

  const paidOtherWay = async () => {
    setBusy(true);
    await record('cash');
    setBusy(false);
  };

  return (
    <Screen scroll footer={missing > 0 || amountText ? (
      <>
        {t.isHead ? <Button title={`Record my share ${formatINR(amount ?? 0)}`} onPress={recordHeadShare} loading={busy} disabled={!amount} /> : null}
        {!t.isHead ? <Button title="I paid another way (cash)" variant="ghost" onPress={paidOtherWay} disabled={busy || !amount} /> : null}
        <Button title="Pay later · go to trip" variant="ghost" onPress={() => router.replace(`/trip/${trip.id}`)} />
      </>
    ) : <Button title="Go to trip" onPress={() => router.replace(`/trip/${trip.id}`)} />}>
      <Header title="Pay my share" subtitle={trip.name} back="close" />
      {missing === 0 && !amountText ? <Note>You’ve paid your full pool share. Thank you!</Note> : null}

      <Card>
        <Row><Text style={[textStyles.muted, { flex: 1 }]}>To</Text>
          <Text style={textStyles.strong} numberOfLines={1}>{t.isHead ? 'Your own pool' : `${headName} (Head)`}</Text></Row>
        {!t.isHead ? <Row last><Text style={[textStyles.muted, { flex: 1 }]}>UPI ID</Text><Text style={textStyles.strong}>{trip.pool_upi_id ?? '—'}</Text></Row> : null}
      </Card>

      <TextField label="Amount (₹)" value={text} onChangeText={setAmountText} keyboardType="decimal-pad" maxLength={12}
        style={{ fontSize: 24, fontWeight: '800', height: 60 }} />
      {missing > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label={`Full ${formatINR(missing)}`} active={amount === missing} onPress={() => setAmountText(paiseToInput(missing))} />
          {missing >= 200 ? <Chip label={`Half ${formatINR(Math.floor(missing / 2))}`} active={amount === Math.floor(missing / 2)}
            onPress={() => setAmountText(paiseToInput(Math.floor(missing / 2)))} /> : null}
        </View>
      ) : null}

      <Card style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={textStyles.muted}>Pool so far</Text>
          <Text style={textStyles.body}><Text style={textStyles.strong}>{formatINR(s.pool.collected)}</Text> of {formatINR(s.pool.target)}</Text>
        </View>
        <Progress value={s.pool.target ? s.pool.collected / s.pool.target : 0} />
      </Card>
      <ErrorText>{error}</ErrorText>
      {!t.isHead && amount && trip.pool_upi_id ? (
        <UpiPaymentSheet payeeUpi={trip.pool_upi_id} payeeName={headName} amountPaise={amount} note={`TT-pool-${trip.id.slice(0, 8)}`}
          onPaid={(ref) => record(profile?.preferred_upi_app ?? 'upi', ref)} />
      ) : null}
      {!t.isHead && !trip.pool_upi_id ? <Note tone="warn">The Head hasn’t added a UPI ID yet.</Note> : null}
      {!t.isHead ? <Note tone="warn">Part-payments are fine. Your payment counts once {headName} confirms it. Anything unpaid is added to your final settlement.</Note> : null}
    </Screen>
  );
}
