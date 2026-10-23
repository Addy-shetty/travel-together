import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TripSummary } from '@/lib/api';
import { categoryLabel } from '@/lib/api';
import { dateRange } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import { colors, radius } from './theme';

const BAR_COLORS = ['#0B5D6B', '#3B8D9B', '#C9772E', '#1B5FA8', '#9AA6B0'];

type Props = {
  summary: TripSummary;
};

export const TripShareCard = forwardRef<View, Props>(function TripShareCard({ summary }, ref) {
  const { trip, total_spent, per_person, expense_count, categories, members } = summary;
  const topCategories = categories.slice(0, 4);

  return (
    <View ref={ref} style={styles.card} collapsable={false}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.tripName}>{trip.name}</Text>
        <Text style={styles.dates}>{dateRange(trip.start_date, trip.end_date)}</Text>
      </View>

      {/* Hero stats */}
      <View style={styles.hero}>
        <View style={styles.heroMain}>
          <Text style={styles.heroLabel}>Total Spent</Text>
          <Text style={styles.heroValue}>{formatINR(total_spent)}</Text>
        </View>
        <View style={styles.heroStats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatINR(per_person)}</Text>
            <Text style={styles.statLabel}>per person</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{expense_count}</Text>
            <Text style={styles.statLabel}>expenses</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{members.length}</Text>
            <Text style={styles.statLabel}>travelers</Text>
          </View>
        </View>
      </View>

      {/* Category breakdown */}
      {topCategories.length > 0 && (
        <View style={styles.categories}>
          <View style={styles.bar}>
            {topCategories.map((c, i) => (
              <View key={c.category} style={{ flex: c.amount, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
            ))}
          </View>
          <View style={styles.categoryList}>
            {topCategories.map((c, i) => (
              <View key={c.category} style={styles.categoryRow}>
                <View style={[styles.dot, { backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }]} />
                <Text style={styles.categoryName}>{categoryLabel(c.category)}</Text>
                <Text style={styles.categoryPct}>{Math.round((c.amount / total_spent) * 100)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Members */}
      <View style={styles.members}>
        {members.slice(0, 6).map((m) => (
          <View key={m.user_id} style={styles.member}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(m.full_name || '?')[0].toUpperCase()}</Text>
            </View>
            <Text style={styles.memberName} numberOfLines={1}>{m.full_name?.split(' ')[0] || 'User'}</Text>
          </View>
        ))}
        {members.length > 6 && (
          <View style={styles.member}>
            <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
              <Text style={styles.avatarText}>+{members.length - 6}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Travel-Together</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xxl,
    padding: 20,
    gap: 16,
  },
  header: { gap: 2 },
  tripName: { fontSize: 22, fontWeight: '800', color: colors.ink },
  dates: { fontSize: 13, color: colors.muted },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: 16, gap: 14 },
  heroMain: { alignItems: 'center', gap: 4 },
  heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  heroValue: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  heroStats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  categories: { gap: 10 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 99, overflow: 'hidden', gap: 2 },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '48%' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  categoryName: { flex: 1, fontSize: 12, color: colors.ink },
  categoryPct: { fontSize: 12, fontWeight: '600', color: colors.muted },
  members: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  member: { alignItems: 'center', gap: 4 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  memberName: { fontSize: 10, color: colors.muted, maxWidth: 40, textAlign: 'center' },
  footer: { alignItems: 'center', paddingTop: 4 },
  footerText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
});
