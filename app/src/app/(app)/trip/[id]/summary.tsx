import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { categoryLabel } from '@/lib/api';
import { dateRange } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { confirmAction } from '@/lib/pay';
import { shareAsImage, shareAsText } from '@/lib/shareTrip';
import { supabase } from '@/lib/supabase';
import { useTrip } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Card, Header, Loading, Row, textStyles } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';
import { TripShareCard } from '@/ui/TripShareCard';

const BAR = ['#0B5D6B', '#3B8D9B', '#C9772E', '#1B5FA8', '#9AA6B0', '#6B4FA0'];

// Screen 4.2.
export default function Summary() {
  const t = useTrip();
  const s = t.summary;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareModal, setShareModal] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<View>(null);

  if (!s) return <Screen><Header title="Trip summary" />{t.loading ? <Loading /> : <ErrorText>{t.error}</ErrorText>}</Screen>;
  const trip = s.trip;
  const nothingPaid = s.settlements.every((x) => x.status === 'pending');

  const handleShareText = async () => {
    setShareModal(false);
    await shareAsText(s);
  };

  const handleShareImage = async () => {
    setSharing(true);
    try {
      await shareAsImage(shareCardRef, trip.name);
    } catch {
      setError('Could not share image');
    }
    setSharing(false);
    setShareModal(false);
  };

  const reopen = async () => {
    if (!(await confirmAction('Reopen the trip?', 'You can add or fix expenses, then end it again.', 'Reopen'))) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('reopen_trip', { p_trip_id: trip.id });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    router.replace(`/trip/${trip.id}`);
  };

  return (
    <Screen scroll footer={trip.status === 'ended'
      ? <Button title={`Settle up · ${s.settlements.length} payment${s.settlements.length === 1 ? '' : 's'}`} onPress={() => router.push(`/trip/${trip.id}/settle`)} />
      : trip.status === 'settled' ? <Button title="View settlements" variant="secondary" onPress={() => router.push(`/trip/${trip.id}/settle`)} /> : undefined}>
      <Header title="Trip summary" subtitle={`${trip.name} · ${dateRange(trip.start_date, trip.end_date)} · ${trip.status === 'active' ? 'Live' : trip.status === 'ended' ? 'Ended' : 'Settled'}`}
        right={<Button title="Share" variant="secondary" onPress={() => setShareModal(true)} style={{ height: 40 }} />} />

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Total spent</Text>
        <Text style={styles.heroValue}>{formatINR(s.total_spent)}</Text>
        <Text style={styles.heroMeta}>{formatINR(s.per_person)} each · {s.expense_count} expenses · {formatINR(s.per_day)}/day</Text>
      </View>

      {s.categories.length ? (
        <Card style={{ padding: 16, gap: 12 }}>
          <Text style={textStyles.strong}>Where the money went</Text>
          <View style={styles.bar}>
            {s.categories.map((c, i) => (
              <View key={c.category} style={{ flex: c.amount, backgroundColor: BAR[i % BAR.length] }} />
            ))}
          </View>
          {s.categories.map((c, i) => (
            <View key={c.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: BAR[i % BAR.length] }} />
              <Text style={[textStyles.body, { flex: 1 }]}>{categoryLabel(c.category)}</Text>
              <Text style={textStyles.sub}>{Math.round((c.amount / s.total_spent) * 100)}%</Text>
              <Text style={[textStyles.strong, { width: 90, textAlign: 'right' }]}>{formatINR(c.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Row style={{ paddingVertical: 10 }}>
          <Text style={[textStyles.sub, { flex: 1.3, fontWeight: '700' }]}>Member</Text>
          <Text style={[textStyles.sub, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>Put in</Text>
          <Text style={[textStyles.sub, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>Net</Text>
        </Row>
        {s.members.map((m, i) => (
          <Row key={m.user_id} last={i === s.members.length - 1}>
            <View style={{ flex: 1.3 }}>
              <Text style={textStyles.strong} numberOfLines={1}>{m.full_name}</Text>
              {m.pool_cash_held > 0 ? <Text style={textStyles.sub}>holds {formatINR(m.pool_cash_held)} pool</Text> : null}
            </View>
            <Text style={[textStyles.body, { flex: 1, textAlign: 'right' }]}>{formatINR(m.contributed + m.paid_direct)}</Text>
            <Text style={[textStyles.amount, { flex: 1, textAlign: 'right' }, m.net >= 0 ? textStyles.gets : textStyles.owe]}>{formatINR(m.net, { signed: true })}</Text>
          </Row>
        ))}
      </Card>

      {t.isHead && trip.status === 'ended' && nothingPaid ? <Button title="Reopen trip" variant="ghost" onPress={reopen} loading={busy} /> : null}
      <ErrorText>{error}</ErrorText>

      {/* Share Modal */}
      <Modal visible={shareModal} transparent animationType="fade" onRequestClose={() => setShareModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShareModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Share Trip Summary</Text>
            <View style={styles.sharePreview}>
              <TripShareCard ref={shareCardRef} summary={s} />
            </View>
            <View style={styles.shareButtons}>
              <Button title="Share as Image" onPress={handleShareImage} loading={sharing} style={{ flex: 1 }} />
              <Button title="Share as Text" variant="secondary" onPress={handleShareText} style={{ flex: 1 }} />
            </View>
            <Button title="Cancel" variant="ghost" onPress={() => setShareModal(false)} />
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.primary, borderRadius: radius.xxl, padding: 20, gap: 8 },
  heroLabel: { color: '#FFFFFF', opacity: 0.9, fontSize: 14 },
  heroValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '800' },
  heroMeta: { color: colors.onPrimarySoft, fontSize: 13 },
  bar: { flexDirection: 'row', height: 14, borderRadius: 99, overflow: 'hidden', gap: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: colors.bg, borderRadius: radius.xxl, padding: 20, gap: 16, width: '100%', maxWidth: 380 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  sharePreview: { alignItems: 'center', backgroundColor: colors.muted, borderRadius: radius.xl, padding: 16 },
  shareButtons: { flexDirection: 'row', gap: 10 },
});
