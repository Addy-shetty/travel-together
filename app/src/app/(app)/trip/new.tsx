import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MoneyMode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { parseDisplayDate } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { parseRupees } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { Button, ErrorText, Screen, TextField } from '@/ui/components';
import { Header } from '@/ui/kit';
import { colors, radius, type } from '@/ui/theme';

const MODES: { key: MoneyMode; title: string; body: string }[] = [
  { key: 'pool', title: 'Shared pool only', body: 'Everyone sends money to you (the Head), and you pay for everything' },
  { key: 'each_pays', title: 'Each pays & logs', body: 'Anyone pays and adds the expense. Split at the end' },
  { key: 'both', title: 'Both (recommended)', body: 'Pool for common costs. Anyone can still pay and log' },
];

// Screen 2.2.
export default function NewTrip() {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mode, setMode] = useState<MoneyMode>('both');
  const [pool, setPool] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const create = async () => {
    const startIso = start.trim() ? parseDisplayDate(start) : null;
    const endIso = end.trim() ? parseDisplayDate(end) : null;
    const poolPaise = mode === 'each_pays' ? 0 : pool.trim() ? parseRupees(pool) : 0;
    const next = {
      name: name.trim() ? undefined : 'Give the trip a name.',
      start: start.trim() && !startIso ? 'Use DD/MM/YYYY.' : undefined,
      end: end.trim() && !endIso ? 'Use DD/MM/YYYY.' : startIso && endIso && endIso < startIso ? 'Ends before it starts.' : undefined,
      pool: poolPaise === null ? 'Enter an amount like 4000.' : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    setFormError(null);
    const { data, error } = await supabase.rpc('create_trip', {
      p_name: name.trim().slice(0, 60),
      p_start_date: startIso ?? undefined,
      p_end_date: endIso ?? undefined,
      p_money_mode: mode,
      p_pool_amount_per_person: poolPaise ?? 0,
      p_default_split: profile?.default_split ?? 'equal',
    });
    setSaving(false);
    if (error || !data) {
      setFormError(friendlyError(error));
      return;
    }
    router.replace(`/trip/${data.id}/members`);
  };

  return (
    <Screen scroll footer={<Button title="Create & invite friends" onPress={create} loading={saving} />}>
      <Header title="New trip" back="close" />
      <TextField label="Trip name" value={name} onChangeText={setName} placeholder="Mangalore" maxLength={60} error={errors.name} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <TextField label="From" value={start} onChangeText={setStart} placeholder="14/11/2026" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.start} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="To" value={end} onChangeText={setEnd} placeholder="17/11/2026" keyboardType="numbers-and-punctuation" maxLength={10} error={errors.end} />
        </View>
      </View>

      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        <Text style={type.label}>How will you pay?</Text>
        {MODES.map((m) => {
          const active = m.key === mode;
          return (
            <Pressable key={m.key} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => setMode(m.key)}
              style={[styles.option, active && styles.optionActive]}>
              <View style={[styles.radio, active && styles.radioActive]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.optionTitle}>{m.title}</Text>
                <Text style={styles.optionBody}>{m.body}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {mode !== 'each_pays' ? (
        <TextField label="Pool amount per person (₹)" value={pool} onChangeText={setPool} placeholder="4000" keyboardType="decimal-pad"
          maxLength={12} error={errors.pool}
          hint={`Collected to your UPI ID: ${profile?.upi_id ?? '—'} · You are the Head`} />
      ) : null}
      <ErrorText>{formError}</ErrorText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  optionActive: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#9AA6B0', marginTop: 2 },
  radioActive: { borderWidth: 6, borderColor: colors.primary, backgroundColor: '#FFFFFF' },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  optionBody: { fontSize: 13, color: colors.muted },
});
