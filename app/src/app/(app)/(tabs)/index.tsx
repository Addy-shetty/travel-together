import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rpc, useLoader, type Overview } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatINR } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Screen } from '@/ui/components';
import { BellIcon, LogoMark } from '@/ui/icons';
import { Avatar, Empty, Loading } from '@/ui/kit';
import { TripCard } from '@/ui/TripCard';
import { colors, radius } from '@/ui/theme';

// Screens 1.5 (first time) and 1.6 (Home).
export default function Home() {
  const { profile } = useAuth();
  const { data, error, loading, reload } = useLoader(() => rpc<Overview>(supabase.rpc('my_overview')), []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const firstName = profile?.full_name.split(' ')[0] ?? '';
  const trips = data?.trips ?? [];

  return (
    <Screen scroll edges={['top']} refreshing={loading && !!data} onRefresh={reload}>
      <View style={styles.top}>
        <View style={{ gap: 2, flex: 1 }}>
          <Text style={styles.greet}>{trips.length ? 'Welcome back' : 'Welcome to Travel-Together'}</Text>
          <Text style={styles.name}>Hi, {firstName}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${data?.unread_notifications ?? 0} unread`}
          onPress={() => router.push('/notifications')} style={styles.bell}>
          <BellIcon />
          {data?.unread_notifications ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(data.unread_notifications, 99)}</Text></View> : null}
        </Pressable>
        <Avatar name={profile?.full_name ?? ''} size={44} />
      </View>

      {loading && !data ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>

      {data ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => router.push('/wallet')} style={styles.wallet}>
            <Text style={styles.walletLabel}>My wallet</Text>
            <Text style={styles.walletBalance}>{formatINR(data.wallet_balance)}</Text>
            <Text style={styles.walletHint}>Your payments in and out, across all trips ›</Text>
          </Pressable>

          <Button title="Scan & Pay any UPI QR" variant="secondary" onPress={() => router.push('/scan')} />

          <View style={styles.chips}>
            <View style={[styles.chip, { backgroundColor: colors.oweSoft }]}>
              <Text style={[styles.chipLabel, { color: '#7A3306' }]}>You owe</Text>
              <Text style={[styles.chipValue, { color: colors.owe }]}>{formatINR(data.you_owe)}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: colors.getsSoft }]}>
              <Text style={[styles.chipLabel, { color: '#143F6E' }]}>You get back</Text>
              <Text style={[styles.chipValue, { color: colors.gets }]}>{formatINR(data.you_get_back)}</Text>
            </View>
          </View>

          {trips.length === 0 ? (
            <Empty title="No trips yet" body="Plan a trip and invite your friends, or join one with an invite code.">
              <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 8 }}>
                <View style={{ alignSelf: 'center', marginBottom: 8 }}><LogoMark size={56} /></View>
                <Button title="Plan a new trip" onPress={() => router.push('/trip/new')} />
                <Button title="Join with a code" variant="secondary" onPress={() => router.push('/trips')} />
              </View>
            </Empty>
          ) : (
            <>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Your trips</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/trip/new')}>
                  <Text style={styles.link}>+ New trip</Text>
                </Pressable>
              </View>
              {trips.slice(0, 5).map((t) => <TripCard key={t.id} trip={t} />)}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greet: { fontSize: 14, color: colors.muted },
  name: { fontSize: 22, fontWeight: '800', color: colors.ink },
  bell: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.owe, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  wallet: { backgroundColor: colors.primary, borderRadius: radius.xxl, padding: 20, gap: 8 },
  walletLabel: { color: '#FFFFFF', opacity: 0.9, fontSize: 14 },
  walletBalance: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  walletHint: { color: colors.onPrimarySoft, fontSize: 13 },
  chips: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderRadius: 16, padding: 14, gap: 4 },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  chipValue: { fontSize: 20, fontWeight: '800' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  link: { fontSize: 15, fontWeight: '700', color: colors.primary },
});
