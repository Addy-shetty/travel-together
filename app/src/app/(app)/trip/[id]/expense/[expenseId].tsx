import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { categoryLabel, rpc, useLoader, type Category } from '@/lib/api';
import { dateTime } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatINR } from '@/lib/money';
import { confirmAction } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { isUuid, useTrip } from '@/lib/useTrip';
import { Button, ErrorText, Screen } from '@/ui/components';
import { Card, Header, Loading, Pill, Row, SectionLabel, textStyles } from '@/ui/kit';
import { colors, radius } from '@/ui/theme';

type Detail = {
  id: string; description: string; category: Category; amount: number; status: 'pending' | 'confirmed' | 'rejected';
  place_name: string | null; spent_at: string; created_by: string; upi_ref: string | null; payee_name: string | null; split_method: string;
  expense_payers: { user_id: string | null; amount: number }[];
  expense_splits: { user_id: string; amount: number; shares: number | null }[];
  expense_events: { id: number; actor_id: string | null; action: string; changes: Record<string, { from?: unknown; to?: unknown }> | null; created_at: string }[];
  expense_comments: { id: string; user_id: string; body: string; created_at: string }[];
};

const FIELD: Record<string, string> = { amount: 'the amount', description: 'the name', category: 'the category', payers: 'who paid',
  splits: 'the split', split_method: 'the split method', place_name: 'the place', spent_at: 'the date' };

function describeChange(field: string, change: { from?: unknown; to?: unknown }): string {
  if (field === 'amount' && typeof change.from === 'number' && typeof change.to === 'number') {
    return `changed the amount from ${formatINR(change.from)} to ${formatINR(change.to)}`;
  }
  return `changed ${FIELD[field] ?? field}`;
}

// Screen 3.4.
export default function ExpenseDetail() {
  const t = useTrip();
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const id = isUuid(expenseId) ? expenseId : null;
  const { data, error, loading, reload } = useLoader(
    () => (id ? rpc<Detail>(supabase.from('expenses')
      .select('id, description, category, amount, status, place_name, spent_at, created_by, upi_ref, payee_name, split_method, expense_payers(user_id, amount), expense_splits(user_id, amount, shares), expense_events(id, actor_id, action, changes, created_at), expense_comments(id, user_id, body, created_at)')
      .eq('id', id).is('deleted_at', null).single()) : Promise.reject({ message: 'NOT_FOUND' })),
    [id]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) return <Screen><Header title="Expense" />{loading ? <Loading /> : <ErrorText>{error}</ErrorText>}</Screen>;
  const canEdit = t.isActive && (data.created_by === t.me || t.isHead);
  const events = [...data.expense_events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const comments = [...data.expense_comments].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const run = async (key: string, fn: () => PromiseLike<{ error: unknown }>, after?: () => void) => {
    setBusy(key);
    setActionError(null);
    const { error: err } = await fn();
    setBusy(null);
    if (err) return setActionError(friendlyError(err));
    if (after) after();
    else reload();
  };

  const remove = async () => {
    if (!(await confirmAction('Delete this expense?', 'Everyone’s balances will be recalculated.', 'Delete', true))) return;
    run('delete', () => supabase.rpc('delete_expense', { p_expense_id: data.id }), () => router.back());
  };

  const send = () => {
    const body = comment.trim().slice(0, 500);
    if (!body) return;
    run('comment', () => supabase.from('expense_comments').insert({ expense_id: data.id, body }), () => { setComment(''); reload(); });
  };

  return (
    <Screen scroll refreshing={loading} onRefresh={reload}>
      <Header title="Expense" right={canEdit ? (
        <Button title="Edit" variant="secondary" style={{ height: 40 }}
          onPress={() => router.push({ pathname: '/trip/[id]/expense/new', params: { id: t.tripId!, edit: data.id } })} />
      ) : undefined} />

      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{categoryLabel(data.category).toUpperCase()} · {dateTime(data.spent_at).toUpperCase()}</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink }}>{data.description}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontSize: 34, fontWeight: '800', color: colors.ink }}>{formatINR(data.amount)}</Text>
          {data.status === 'pending' ? <Pill label="PENDING" tone="warn" /> : null}
        </View>
        {data.place_name ? <Text style={textStyles.muted}>Place: {data.place_name}</Text> : null}
      </View>

      {data.status === 'pending' && (data.created_by === t.me || t.isHead) && t.isActive ? (
        <Card style={{ padding: 14, gap: 10, borderColor: colors.owe, borderWidth: 1.5 }}>
          <Text style={textStyles.strong}>Did the UPI payment{data.payee_name ? ` to ${data.payee_name}` : ''} go through?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Yes, paid" style={{ flex: 1, height: 44 }} loading={busy === 'yes'}
              onPress={() => run('yes', () => supabase.rpc('confirm_expense_payment', { p_expense_id: data.id, p_success: true }))} />
            <Button title="It failed" variant="secondary" style={{ flex: 1, height: 44 }} disabled={!!busy}
              onPress={() => run('no', () => supabase.rpc('confirm_expense_payment', { p_expense_id: data.id, p_success: false }), () => router.back())} />
          </View>
        </Card>
      ) : null}

      <Card>
        {data.expense_payers.map((p) => (
          <Row key={p.user_id ?? 'pool'}>
            <Text style={[textStyles.muted, { flex: 1 }]}>Paid by</Text>
            <Text style={textStyles.strong}>{t.nameOf(p.user_id)}{data.expense_payers.length > 1 ? ` · ${formatINR(p.amount)}` : ''}</Text>
          </Row>
        ))}
        {data.upi_ref ? <Row><Text style={[textStyles.muted, { flex: 1 }]}>UPI ref</Text><Text style={textStyles.strong}>{data.upi_ref}</Text></Row> : null}
        <Row last>
          <Text style={[textStyles.muted, { flex: 1 }]}>Split {data.split_method === 'equal' ? 'equally' : data.split_method === 'shares' ? 'by shares' : 'by amount'} · {data.expense_splits.length}</Text>
        </Row>
        {data.expense_splits.map((sp, i) => (
          <Row key={sp.user_id} last={i === data.expense_splits.length - 1} style={{ paddingVertical: 8 }}>
            <Text style={[textStyles.body, { flex: 1 }]}>{t.nameOf(sp.user_id)}{sp.shares ? ` · ${sp.shares} share${sp.shares === 1 ? '' : 's'}` : ''}</Text>
            <Text style={textStyles.strong}>{formatINR(sp.amount)}</Text>
          </Row>
        ))}
      </Card>

      <SectionLabel>History</SectionLabel>
      <View style={{ gap: 6 }}>
        {events.map((ev) => (
          <Text key={ev.id} style={textStyles.muted}>
            • {t.nameOf(ev.actor_id)}{' '}
            {ev.action === 'updated' && ev.changes ? Object.entries(ev.changes).map(([f, c]) => describeChange(f, c)).join(', ')
              : { created: 'added it', deleted: 'deleted it', confirmed: 'confirmed the payment', rejected: 'marked the payment as failed' }[ev.action] ?? ev.action}
            {' · '}{dateTime(ev.created_at)}
          </Text>
        ))}
      </View>

      <SectionLabel>{`Comments · ${comments.length}`}</SectionLabel>
      {comments.map((c) => (
        <Card key={c.id} style={{ padding: 12, gap: 2 }}>
          <Text style={textStyles.body}><Text style={textStyles.strong}>{t.nameOf(c.user_id)}: </Text>{c.body}</Text>
          <Text style={textStyles.sub}>{dateTime(c.created_at)}</Text>
        </Card>
      ))}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput accessibilityLabel="Add a comment" value={comment} onChangeText={setComment} placeholder="Add a comment" placeholderTextColor="#7A8791"
          maxLength={500} style={{ flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 12, fontSize: 14, color: colors.ink }} />
        <Button title="Send" onPress={send} loading={busy === 'comment'} disabled={!comment.trim()} style={{ height: 44 }} />
      </View>
      <ErrorText>{actionError}</ErrorText>

      {canEdit ? <Button title="Delete expense" variant="ghost" onPress={remove} loading={busy === 'delete'} /> : null}
    </Screen>
  );
}
