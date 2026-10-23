import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rpc, useLoader, type Overview, type WalletTx } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Card, Empty, Header, Loading, Note, Row, SectionLabel, textStyles } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';

const LABEL: Record<WalletTx['type'], string> = {
  topup: 'Added money', withdrawal: 'Withdrawal', pool_contribution: 'Pool contribution',
  settlement_paid: 'Settlement paid', settlement_received: 'Settlement received', adjustment: 'Adjustment',
};

type UpiPayment = {
  id: string; trip_id: string; description: string; amount: number; payee_name: string | null; payee_upi: string;
  upi_ref: string | null; spent_at: string; trips: { name: string } | null;
};

// Screen 1.7. A ledger of your own money movements. Top-ups are deliberately not offered
// (holding money needs an RBI PPI licence); Scan & Pay records direct UPI payments instead.
export default function Wallet() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const { data, error, loading, reload } = useLoader(async () => {
    const [overview, txs, payments] = await Promise.all([
      rpc<Overview>(supabase.rpc('my_overview')),
      rpc<WalletTx[]>(supabase.from('wallet_transactions').select('*').eq('user_id', uid ?? '')
        .order('created_at', { ascending: false }).limit(100)),
      // Payments I made through Scan & Pay / Pay now: the record of who was paid, for what and which trip.
      rpc<UpiPayment[]>(supabase.from('expenses')
        .select('id, trip_id, description, amount, payee_name, payee_upi, upi_ref, spent_at, trips(name)')
        .eq('created_by', uid ?? '').eq('status', 'confirmed').is('deleted_at', null).not('payee_upi', 'is', null)
        .order('spent_at', { ascending: false }).limit(100)),
    ]);
    return { overview, txs, payments };
  }, [uid]);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  return (
    <Screen scroll edges={['top']} refreshing={loading && !!data} onRefresh={reload}>
      <Header title="My wallet" back={false} />
      {loading && !data ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>
      {data ? (
        <>
          <View style={styles.balance}>
            <Text style={styles.balanceLabel}>Net across all trips</Text>
            <Text style={styles.balanceValue}>{formatINR(data.overview.wallet_balance)}</Text>
          </View>
          <Button title="Scan & Pay any UPI QR" onPress={() => router.push('/scan')} />
          <Note>
            Travel-Together never holds your money. Scan & Pay sends money straight from your bank through your UPI app,
            and saves the payment with who was paid, why and for which trip. This wallet keeps the record of your pool
            payments and settlements.
          </Note>
          <SectionLabel>My UPI payments</SectionLabel>
          {data.payments.length === 0 ? <Empty title="No payments yet" body="Payments you make with Scan & Pay show up here with who you paid." /> : (
            <Card>
              {data.payments.map((p, i) => (
                <Row key={p.id} last={i === data.payments.length - 1} onPress={() => router.push(`/trip/${p.trip_id}/expense/${p.id}`)}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={textStyles.strong} numberOfLines={1}>{p.payee_name || p.payee_upi}</Text>
                    <Text style={textStyles.sub} numberOfLines={1}>{p.description} · {p.trips?.name ?? 'Trip'}</Text>
                    <Text style={textStyles.sub} numberOfLines={1}>{p.payee_upi} · {dateTime(p.spent_at)}{p.upi_ref ? ` · UPI ${p.upi_ref}` : ''}</Text>
                  </View>
                  <Text style={[textStyles.amount, textStyles.owe]}>{formatINR(-p.amount)}</Text>
                </Row>
              ))}
            </Card>
          )}

          <SectionLabel>Pool & settlements</SectionLabel>
          {data.txs.length === 0 ? <Empty title="Nothing yet" body="Pool payments and settlements show up here." /> : (
            <Card>
              {data.txs.map((t, i) => (
                <Row key={t.id} last={i === data.txs.length - 1}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={textStyles.strong}>{t.note ?? LABEL[t.type]}</Text>
                    <Text style={textStyles.sub}>
                      {dateTime(t.created_at)}{t.status !== 'confirmed' ? ` · ${t.status}` : ''}{t.upi_ref ? ` · UPI ${t.upi_ref}` : ''}
                    </Text>
                  </View>
                  <Text style={[textStyles.amount, t.amount > 0 ? textStyles.gets : textStyles.owe]}>
                    {formatINR(t.amount, { signed: true })}
                  </Text>
                </Row>
              ))}
            </Card>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balance: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 20, gap: 4 },
  balanceLabel: { fontSize: 14, color: colors.muted },
  balanceValue: { fontSize: 32, fontWeight: '800', color: colors.ink },
});
