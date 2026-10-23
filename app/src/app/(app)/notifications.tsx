import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { rpc, useLoader, type Notification } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Card, Empty, Header, Loading, SectionLabel, textStyles } from '@/ui/kit';
import { colors } from '@/ui/theme';

// Notification payloads come from our own database functions, but are still read defensively.
const str = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v) ? v : null);

// Screen 3.6.
export default function Notifications() {
  const { session } = useAuth();
  const uid = session?.user.id ?? '';
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, loading, reload } = useLoader(
    () => rpc<Notification[]>(supabase.from('notifications').select('*').eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(100)),
    [uid]);
  useFocusEffect(useCallback(() => {
    reload();
    // Opening the list marks everything read; "needs action" items stay listed until handled.
    const t = setTimeout(() => { supabase.rpc('mark_notifications_read', {}).then(() => undefined); }, 1500);
    return () => clearTimeout(t);
  }, [reload]));

  const act = async (n: Notification, yes: boolean) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    setBusy(n.id);
    setError(null);
    let err: unknown = null;
    if (n.type === 'confirm_contribution' && str(d.contribution_id)) {
      ({ error: err } = await supabase.rpc('confirm_pool_contribution', { p_contribution_id: str(d.contribution_id)!, p_received: yes }));
    } else if (n.type === 'confirm_settlement' && str(d.settlement_id)) {
      ({ error: err } = await supabase.rpc('confirm_settlement', { p_settlement_id: str(d.settlement_id)!, p_received: yes }));
    }
    setBusy(null);
    if (err) setError(friendlyError(err));
    reload();
  };

  const open = (n: Notification) => {
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (!n.trip_id) return;
    if (str(d.expense_id)) router.push(`/trip/${n.trip_id}/expense/${str(d.expense_id)}`);
    else if (n.type === 'reminder' && d.kind === 'pool') router.push(`/trip/${n.trip_id}/pay-share`);
    else if (n.type === 'reminder' || n.type.startsWith('settlement') || n.type === 'trip_ended' || n.type === 'trip_settled') router.push(`/trip/${n.trip_id}/settle`);
    else router.push(`/trip/${n.trip_id}`);
  };

  const list = data ?? [];
  const action = list.filter((n) => n.action_required && (n.type === 'confirm_contribution' || n.type === 'confirm_settlement'));
  const rest = list.filter((n) => !action.includes(n));

  return (
    <Screen scroll refreshing={loading && !!data} onRefresh={reload}>
      <Header title="Notifications" />
      {loading && !data ? <Loading /> : null}
      <ErrorText>{error}</ErrorText>
      {data && list.length === 0 ? <Empty title="You’re all caught up" body="Payments, new expenses and reminders show up here." /> : null}

      {action.length ? <SectionLabel>Needs action</SectionLabel> : null}
      {action.map((n) => (
        <Card key={n.id} style={{ padding: 14, gap: 10, borderColor: colors.owe, borderWidth: 1.5 }}>
          <View style={{ gap: 2 }}>
            <Text style={textStyles.strong}>{n.title}</Text>
            {n.body ? <Text style={textStyles.muted}>{n.body}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Yes, received" onPress={() => act(n, true)} loading={busy === n.id} style={{ flex: 1, height: 44 }} />
            <Button title="Not yet" variant="secondary" onPress={() => act(n, false)} disabled={busy === n.id} style={{ flex: 1, height: 44 }} />
          </View>
        </Card>
      ))}

      {rest.length ? <SectionLabel>Earlier</SectionLabel> : null}
      {rest.length ? (
        <Card>
          {rest.map((n, i) => (
            <Pressable key={n.id} accessibilityRole="button" onPress={() => open(n)}
              style={[styles.item, i < rest.length - 1 && styles.divider]}>
              <View style={[styles.dot, { backgroundColor: n.read_at ? colors.line : colors.primary }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={textStyles.body}>{n.title}</Text>
                {n.body ? <Text style={textStyles.muted}>{n.body}</Text> : null}
                <Text style={textStyles.sub}>{dateTime(n.created_at)}</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: 12, padding: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
});
