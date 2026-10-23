import { router } from 'expo-router';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import type { OverviewTrip } from '@/lib/api';
import { dateRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { Card, Pill, Progress } from './kit';
import { colors } from './theme';

export function TripCard({ trip }: { trip: OverviewTrip }) {
  const pill = trip.status === 'active' ? <Pill label="LIVE" tone="live" />
    : trip.status === 'ended' ? <Pill label="SETTLING" tone="warn" /> : <Pill label="SETTLED" />;
  const net = trip.my_net ?? 0;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/trip/${trip.id}`)}>
      <Card style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
            <Text style={styles.tripMeta}>
              {dateRange(trip.start_date, trip.end_date)} · {trip.member_count} members{trip.my_role === 'head' ? ' · You’re Head' : ''}
            </Text>
          </View>
          {pill}
        </View>
        {trip.status === 'active' && trip.total_spent > 0 ? (
          <Progress value={trip.total_spent / Math.max(trip.total_spent, trip.pool_amount_per_person * trip.member_count || 1)} />
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.tripMeta}>{formatINR(trip.total_spent)} spent</Text>
          {trip.status !== 'settled' && net !== 0 ? (
            <Text style={[styles.tripMeta, { fontWeight: '700', color: net > 0 ? colors.gets : colors.owe }]}>
              {net > 0 ? `You get ${formatINR(net)}` : `You owe ${formatINR(-net)}`}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tripName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  tripMeta: { fontSize: 13, color: colors.muted },
});
