import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryLabel } from '@/lib/api';
import { dateRange, shortDate } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { useTrip, type ExpenseItem } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { ChevronIcon } from '@/ui/icons';
import { Card, Empty, Header, Loading, Note, Pill, Progress, Row, Segmented, textStyles } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';

type Tab = 'expenses' | 'balances';

// Screens 2.6 (dashboard) and 3.5 (live balances).
export default function TripDashboard() {
  const t = useTrip(true);
  const [tab, setTab] = useState<Tab>('expenses');
  const s = t.summary;

  if (!s) {
    return <Screen><Header title="Trip" />{t.loading ? <Loading /> : <ErrorText>{t.error}</ErrorText>}</Screen>;
  }
  const trip = s.trip;
  const myShare = s.members.find((m) => m.user_id === t.me)?.share ?? 0;
  const headName = s.members.find((m) => m.user_id === trip.head_id)?.full_name ?? 'the Head';
  const usesPool = trip.money_mode !== 'each_pays';

  const right = t.isActive && t.isHead
    ? <Button title="End trip" variant="secondary" onPress={() => router.push(`/trip/${trip.id}/end`)} style={{ height: 40 }} />
    : undefined;

  return (
    <Screen scroll refreshing={t.loading} onRefresh={t.reload}
      footer={t.isActive ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Scan & Pay" variant="secondary" style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/scan', params: { trip: trip.id } })} />
          <Button title="+ Add expense" style={{ flex: 1 }} onPress={() => router.push(`/trip/${trip.id}/expense/new`)} />
        </View>
      ) : undefined}>
      <Header title={trip.name} subtitle={`${dateRange(trip.start_date, trip.end_date)} · ${s.member_count} members`} right={right} />
      <ErrorText>{t.error}</ErrorText>

      {!t.isActive ? (
        <Pressable accessibilityRole="button" onPress={() => router.push(`/trip/${trip.id}/${trip.status === 'settled' ? 'summary' : 'settle'}`)}>
          <Note tone={trip.status === 'settled' ? 'info' : 'warn'}>
            {trip.status === 'settled' ? 'This trip is settled. Tap to see the summary.' : 'This trip has ended. Tap to settle up.'}
          </Note>
        </Pressable>
      ) : null}

      {usesPool ? (
        <View style={styles.pool}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.poolLabel}>Trip pool balance</Text>
            <Text style={styles.poolHeld}>held by {trip.head_id === t.me ? 'you' : headName}</Text>
          </View>
          <Text style={styles.poolValue}>{formatINR(s.pool.balance)}</Text>
          <Text style={styles.poolMeta}>Collected {formatINR(s.pool.collected)} of {formatINR(s.pool.target)} · Spent {formatINR(s.pool.spent)}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Card style={styles.stat}><Text style={textStyles.sub}>Trip total</Text><Text style={styles.statValue}>{formatINR(s.total_spent)}</Text></Card>
        <Card style={styles.stat}><Text style={textStyles.sub}>My share so far</Text><Text style={styles.statValue}>{formatINR(myShare)}</Text></Card>
      </View>

      <Pressable accessibilityRole="button" onPress={() => router.push(`/trip/${trip.id}/members`)}>
        <Card><Row last>
          <Text style={[textStyles.strong, { flex: 1 }]}>Members & pool · invite friends</Text>
          <ChevronIcon color={colors.muted} />
        </Row></Card>
      </Pressable>

      <Segmented<Tab> value={tab} onChange={setTab} options={[{ key: 'expenses', label: 'Expenses' }, { key: 'balances', label: 'Balances' }]} />

      {tab === 'expenses' ? <ExpenseList items={t.expenses} tripId={trip.id} nameOf={t.nameOf} /> : (
        <>
          <Text style={textStyles.muted}>Fair share so far: {formatINR(s.per_person)} each · Total {formatINR(s.total_spent)}</Text>
          <Card>
            {s.members.map((m, i) => {
              const max = Math.max(...s.members.map((x) => Math.abs(x.net)), 1);
              return (
                <View key={m.user_id} style={[styles.balance, i < s.members.length - 1 && styles.divider]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={textStyles.strong}>{m.user_id === t.me ? `${m.full_name} (you)` : m.full_name}</Text>
                    <Text style={[textStyles.amount, m.net >= 0 ? textStyles.gets : textStyles.owe]}>{formatINR(m.net, { signed: true })}</Text>
                  </View>
                  <Progress value={Math.abs(m.net) / max} color={m.net >= 0 ? colors.gets : colors.owe} />
                  <Text style={textStyles.sub}>
                    Put in {formatINR(m.contributed + m.paid_direct)}
                    {m.contributed ? ` · pool ${formatINR(m.contributed)}` : ''}{m.paid_direct ? ` · paid ${formatINR(m.paid_direct)}` : ''}
                    {m.pool_cash_held ? ` · holds ${formatINR(m.pool_cash_held)} pool cash` : ''}
                  </Text>
                </View>
              );
            })}
          </Card>
          {usesPool && s.pool.balance > 0 ? <Note>{formatINR(s.pool.balance)} is still unspent in the pool. It’s shared back fairly when the trip ends.</Note> : null}
        </>
      )}
    </Screen>
  );
}

function ExpenseList({ items, tripId, nameOf }: { items: ExpenseItem[]; tripId: string; nameOf: (u: string | null) => string }) {
  if (items.length === 0) return <Empty title="No expenses yet" body="Tap “Add expense” to log the first one." />;
  const days = new Map<string, ExpenseItem[]>();
  for (const e of items) {
    const d = e.spent_at.slice(0, 10);
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  return (
    <>
      {[...days.entries()].map(([day, list]) => (
        <View key={day} style={{ gap: 8 }}>
          <Text style={styles.day}>{shortDate(day).toUpperCase()}</Text>
          <Card>
            {list.map((e, i) => {
              const payer = e.expense_payers.length > 1 ? 'Several people' : nameOf(e.expense_payers[0]?.user_id ?? null);
              return (
                <Row key={e.id} last={i === list.length - 1} onPress={() => router.push(`/trip/${tripId}/expense/${e.id}`)}>
                  <View style={styles.cat}><Text style={styles.catText}>{categoryLabel(e.category).slice(0, 2)}</Text></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={textStyles.strong} numberOfLines={1}>{e.description}</Text>
                    <Text style={[textStyles.sub, e.status === 'pending' && { color: colors.owe, fontWeight: '600' }]} numberOfLines={1}>
                      {e.status === 'pending' ? 'Waiting for UPI confirmation'
                        : `${payer} paid · split ${e.expense_splits.length} ways${e.place_name ? ` · ${e.place_name}` : ''}`}
                    </Text>
                  </View>
                  <Text style={textStyles.amount}>{formatINR(e.amount)}</Text>
                  {e.status === 'pending' ? <Pill label="PENDING" tone="warn" /> : null}
                </Row>
              );
            })}
          </Card>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  pool: { backgroundColor: colors.primary, borderRadius: radius.xxl, padding: 18, gap: 8 },
  poolLabel: { color: '#FFFFFF', opacity: 0.9, fontSize: 14 },
  poolHeld: { color: colors.onPrimarySoft, fontSize: 12, fontWeight: '700' },
  poolValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  poolMeta: { color: colors.onPrimarySoft, fontSize: 13 },
  stat: { flex: 1, padding: 14, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.ink },
  balance: { padding: 14, gap: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  day: { fontSize: 13, fontWeight: '700', color: colors.muted },
  cat: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  catText: { fontSize: 13, fontWeight: '800', color: colors.primary },
});
