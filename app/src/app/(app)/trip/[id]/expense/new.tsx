import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { CATEGORIES, rpc, useLoader, type Category, type SplitMethod } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { formatINR, paiseToInput, parseRupees } from '@/lib/money';
import { payWithUpi } from '@/lib/pay';
import { supabase } from '@/lib/supabase';
import { isUuid, useTrip } from '@/lib/useTrip';
import { isValidUpiId } from '@/lib/validation';
import { Button, ErrorText, Screen, TextField } from '@/ui/components';
import { Avatar, Card, Chip, Header, Loading, Note, Row, Segmented, textStyles } from '@/ui/kit';
import { colors, radius, type } from '@/ui/theme';

type Initial = {
  amount: string; description: string; category: Category; payer: string; method: SplitMethod;
  included: string[]; shares: Record<string, number>; exact: Record<string, string>; place: string;
};

// Screens 3.1–3.3 (add) and editing an existing expense (?edit=<expense id>).
export default function ExpenseFormScreen() {
  const t = useTrip();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editId = isUuid(edit) ? edit : null;

  const active = useLoader(
    () => (t.tripId ? rpc<{ user_id: string }[]>(supabase.from('trip_members').select('user_id').eq('trip_id', t.tripId).is('left_at', null))
      : Promise.resolve([])), [t.tripId]);
  const existing = useLoader(async () => {
    if (!editId) return null;
    return rpc<{ amount: number; description: string; category: Category; split_method: SplitMethod; place_name: string | null;
      expense_payers: { user_id: string | null; amount: number }[]; expense_splits: { user_id: string; amount: number; shares: number | null }[] }>(
      supabase.from('expenses').select('amount, description, category, split_method, place_name, expense_payers(user_id, amount), expense_splits(user_id, amount, shares)')
        .eq('id', editId).single());
  }, [editId]);

  if (!t.summary || active.loading || existing.loading) {
    return <Screen><Header title={editId ? 'Edit expense' : 'Add expense'} back="close" />{t.error ? <ErrorText>{t.error}</ErrorText> : <Loading />}</Screen>;
  }
  const memberIds = (active.data ?? []).map((m) => m.user_id);
  const e = existing.data;
  const initial: Initial = e ? {
    amount: paiseToInput(e.amount), description: e.description, category: e.category,
    payer: e.expense_payers[0]?.user_id ?? 'pool', method: e.split_method,
    included: e.expense_splits.map((s) => s.user_id),
    shares: Object.fromEntries(memberIds.map((id) => [id, Number(e.expense_splits.find((s) => s.user_id === id)?.shares ?? 0)])),
    exact: Object.fromEntries(e.expense_splits.map((s) => [s.user_id, paiseToInput(s.amount)])),
    place: e.place_name ?? '',
  } : {
    amount: '', description: '', category: 'food', payer: t.me, method: t.summary.trip.default_split,
    included: memberIds, shares: Object.fromEntries(memberIds.map((id) => [id, 1])), exact: {}, place: '',
  };
  return <ExpenseForm key={editId ?? 'new'} t={t} memberIds={memberIds} initial={initial} editId={editId}
    multiPayer={(e?.expense_payers.length ?? 0) > 1} />;
}

function ExpenseForm({ t, memberIds, initial, editId, multiPayer }: {
  t: ReturnType<typeof useTrip>; memberIds: string[]; initial: Initial; editId: string | null; multiPayer: boolean;
}) {
  const s = t.summary!;
  const trip = s.trip;
  const [amountText, setAmountText] = useState(initial.amount);
  const [description, setDescription] = useState(initial.description);
  const [category, setCategory] = useState<Category>(initial.category);
  const [payer, setPayer] = useState(initial.payer); // a user id, or 'pool'
  const [method, setMethod] = useState<SplitMethod>(initial.method);
  const [included, setIncluded] = useState<string[]>(initial.included);
  const [shares, setShares] = useState<Record<string, number>>(initial.shares);
  const [exact, setExact] = useState<Record<string, string>>(initial.exact);
  const [place, setPlace] = useState(initial.place);
  const [payNow, setPayNow] = useState(false);
  const [payeeUpi, setPayeeUpi] = useState('');
  const [payeeName, setPayeeName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amount = parseRupees(amountText);
  const canPayNow = !editId && (payer === t.me || (payer === 'pool' && t.isHead));
  const poolAllowed = trip.money_mode !== 'each_pays';

  // Preview of each person's share, using the same rounding as the server.
  const preview = useMemo(() => {
    const out: Record<string, number> = {};
    if (!amount) return out;
    if (method === 'equal') {
      included.forEach((id, i) => { out[id] = Math.floor(amount / included.length) + (i < amount % included.length ? 1 : 0); });
    } else if (method === 'shares') {
      const total = memberIds.reduce((a, id) => a + (shares[id] ?? 0), 0);
      if (total > 0) memberIds.forEach((id) => { if (shares[id]) out[id] = Math.round((amount * shares[id]) / total); });
    } else {
      memberIds.forEach((id) => { const v = parseRupees(exact[id] ?? ''); if (v) out[id] = v; });
    }
    return out;
  }, [amount, method, included, shares, exact, memberIds]);
  const exactTotal = Object.values(preview).reduce((a, b) => a + b, 0);

  const buildSplits = () => {
    if (method === 'equal') return included.length ? included.map((user_id) => ({ user_id })) : null;
    if (method === 'shares') {
      const list = memberIds.map((user_id) => ({ user_id, shares: shares[user_id] ?? 0 }));
      return list.some((x) => x.shares > 0) ? list : null;
    }
    const list = memberIds.map((user_id) => ({ user_id, amount: parseRupees(exact[user_id] ?? '') ?? 0 })).filter((x) => x.amount > 0);
    return list.length && exactTotal === amount ? list : null;
  };

  const save = async () => {
    if (!amount) return setError('Enter an amount.');
    if (!description.trim()) return setError('What was it for?');
    const splits = buildSplits();
    if (!splits) return setError(method === 'exact' ? `The split adds up to ${formatINR(exactTotal)}, not ${formatINR(amount)}.` : 'Choose who it’s split among.');
    if (payNow && !isValidUpiId(payeeUpi)) return setError('Enter the shop’s UPI ID, or turn off “Pay now”.');
    setError(null);
    setSaving(true);
    const payers = [{ user_id: payer === 'pool' ? null : payer, amount }];

    if (editId) {
      const { error: err } = await supabase.rpc('update_expense', {
        p_expense_id: editId, p_description: description.trim().slice(0, 100), p_amount: amount, p_category: category,
        p_payers: multiPayer ? undefined : payers, p_split_method: method, p_splits: splits, p_place_name: place.trim() || undefined,
      });
      setSaving(false);
      if (err) return setError(friendlyError(err));
      return router.back();
    }

    const { data: id, error: err } = await supabase.rpc('create_expense', {
      p_trip_id: trip.id, p_description: description.trim().slice(0, 100), p_amount: amount, p_category: category,
      p_payers: payers, p_split_method: method, p_splits: splits, p_status: payNow ? 'pending' : 'confirmed',
      p_place_name: place.trim().slice(0, 80) || undefined,
      p_payee_upi: payNow ? payeeUpi.trim() : undefined, p_payee_name: payNow ? payeeName.trim().slice(0, 60) || undefined : undefined,
    });
    if (err || !id) {
      setSaving(false);
      return setError(friendlyError(err));
    }
    if (payNow) {
      const result = await payWithUpi({ payeeUpi: payeeUpi.trim(), payeeName: payeeName || description, amountPaise: amount, note: `${trip.name}: ${description}` });
      await supabase.rpc('confirm_expense_payment', { p_expense_id: id, p_success: result === 'paid' });
    }
    setSaving(false);
    router.replace(`/trip/${trip.id}`);
  };

  const people = memberIds.map((id) => ({ id, name: t.nameOf(id) }));

  return (
    <Screen scroll footer={
      <Button title={editId ? 'Save changes' : payNow && amount ? `Pay ${formatINR(amount)} via UPI` : 'Save expense'} onPress={save} loading={saving} />
    }>
      <Header title={editId ? 'Edit expense' : 'Add expense'} back="close" />

      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text style={type.small} nativeID="amountLabel">Amount (₹)</Text>
        <TextInput accessibilityLabelledBy="amountLabel" value={amountText} onChangeText={setAmountText} placeholder="0"
          placeholderTextColor="#9AA6B0" keyboardType="decimal-pad" maxLength={12} style={styles.amount} autoFocus={!editId} />
        <TextInput accessibilityLabel="What was it for" value={description} onChangeText={setDescription} placeholder="What was it for?"
          placeholderTextColor="#7A8791" maxLength={100} style={styles.desc} />
      </View>

      <View style={styles.wrap}>
        {CATEGORIES.map((c) => <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />)}
      </View>

      {multiPayer ? <Note>Several people paid for this one; who paid stays as it was.</Note> : (
        <View style={{ gap: 8 }}>
          <Text style={type.label}>Paid by</Text>
          <View style={styles.wrap}>
            {poolAllowed ? <Chip label="Trip pool" active={payer === 'pool'} onPress={() => setPayer('pool')} /> : null}
            {people.map((p) => <Chip key={p.id} label={p.name} active={payer === p.id} onPress={() => setPayer(p.id)} />)}
          </View>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={type.label}>Split</Text>
        <Segmented<SplitMethod> value={method} onChange={setMethod}
          options={[{ key: 'equal', label: 'Equally' }, { key: 'exact', label: 'Exact ₹' }, { key: 'shares', label: 'Shares' }]} />
        <Card>
          {people.map((p, i) => {
            const on = method === 'equal' ? included.includes(p.id) : method === 'shares' ? (shares[p.id] ?? 0) > 0 : !!preview[p.id];
            return (
              <Row key={p.id} last={i === people.length - 1}>
                <Avatar name={p.name} size={34} strong={on} dashed={!on} />
                <Text style={[textStyles.body, { flex: 1 }, !on && { color: colors.muted }]}>{p.name}</Text>
                {method === 'equal' ? (
                  <>
                    <Text style={textStyles.sub}>{on && preview[p.id] ? formatINR(preview[p.id]) : 'Skipped'}</Text>
                    <Switch value={on} trackColor={{ true: colors.primary }} accessibilityLabel={`Include ${p.name}`}
                      onValueChange={(v) => setIncluded((cur) => (v ? memberIds.filter((id) => id === p.id || cur.includes(id)) : cur.filter((id) => id !== p.id)))} />
                  </>
                ) : method === 'shares' ? (
                  <>
                    <Text style={[textStyles.sub, { width: 64, textAlign: 'right' }]}>{preview[p.id] ? formatINR(preview[p.id]) : '₹0'}</Text>
                    <Stepper value={shares[p.id] ?? 0} label={p.name} onChange={(v) => setShares((cur) => ({ ...cur, [p.id]: v }))} />
                  </>
                ) : (
                  <TextInput accessibilityLabel={`Amount for ${p.name}`} value={exact[p.id] ?? ''} placeholder="0" placeholderTextColor="#9AA6B0"
                    keyboardType="decimal-pad" maxLength={10} onChangeText={(v) => setExact((cur) => ({ ...cur, [p.id]: v }))} style={styles.exact} />
                )}
              </Row>
            );
          })}
        </Card>
        {method === 'exact' && amount ? (
          <Text style={[textStyles.sub, { color: exactTotal === amount ? colors.gets : colors.owe, fontWeight: '700' }]}>
            {exactTotal === amount ? 'Adds up ✓' : `${formatINR(Math.abs(amount - exactTotal))} ${exactTotal < amount ? 'left to assign' : 'too much'}`}
          </Text>
        ) : null}
      </View>

      <TextField label="Place (optional)" value={place} onChangeText={setPlace} placeholder="Panambur Beach" maxLength={80} />

      {canPayNow ? (
        <Card style={{ padding: 14, gap: 12 }}>
          <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={() => setPayNow(!payNow)} accessibilityRole="switch" accessibilityState={{ checked: payNow }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={textStyles.strong}>Pay now with UPI</Text>
              <Text style={textStyles.sub}>Opens your UPI app. Saved as pending until you confirm it went through.</Text>
            </View>
            <Switch value={payNow} onValueChange={setPayNow} trackColor={{ true: colors.primary }} accessibilityLabel="Pay now with UPI" />
          </Pressable>
          {payNow ? (
            <>
              <TextField label="Shop’s UPI ID" value={payeeUpi} onChangeText={(v) => setPayeeUpi(v.replace(/\s/g, ''))} placeholder="boatclub@ybl"
                autoCapitalize="none" autoCorrect={false} maxLength={320} />
              <TextField label="Shop name (optional)" value={payeeName} onChangeText={setPayeeName} placeholder="Panambur Boat Club" maxLength={60} />
            </>
          ) : null}
        </Card>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Fewer shares for ${label}`} onPress={() => onChange(Math.max(0, value - 1))} style={styles.step}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Text style={[textStyles.strong, { width: 22, textAlign: 'center' }]}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`More shares for ${label}`} onPress={() => onChange(Math.min(99, value + 1))} style={styles.step}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { fontSize: 44, fontWeight: '800', color: colors.ink, textAlign: 'center', minWidth: 160 },
  desc: { width: 240, height: 42, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface,
    textAlign: 'center', fontSize: 15, color: colors.ink },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exact: { width: 90, height: 40, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line, textAlign: 'right', paddingHorizontal: 10,
    fontSize: 15, color: colors.ink, backgroundColor: colors.surface },
  step: { width: 34, height: 34, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, color: colors.ink },
});
