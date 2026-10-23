import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatINR, paiseToInput } from '@/lib/money';
import { payWithUpi } from '@/lib/pay';
import { normalizeUpiRef } from '@/lib/validation';
import { Button, ErrorText, TextField } from './components';
import { Card, textStyles } from './kit';
import { colors, radius } from './theme';

/**
 * "Pay in your UPI app": the route that always works. UPI apps block payments to personal UPI IDs
 * that are started from other apps, but payments made inside the UPI app go through. The payer
 * copies the UPI ID, pays in GPay/PhonePe, comes back and confirms (optionally with the UPI ref).
 * Receivers still confirm on the server for pool shares and settlements.
 */
export function ManualPay({
  payeeUpi, payeeName, amountPaise, note, onPaid, allowAppLaunch = true,
}: {
  payeeUpi: string; payeeName: string; amountPaise: number; note: string;
  onPaid: (upiRef: string | undefined) => Promise<void>;
  allowAppLaunch?: boolean;
}) {
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState<'upi' | 'amount' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async (what: 'upi' | 'amount') => {
    await Clipboard.setStringAsync(what === 'upi' ? payeeUpi : paiseToInput(amountPaise));
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  const confirm = async () => {
    const r = normalizeUpiRef(ref);
    if (r === null) return setError('The UPI reference should be 6–35 letters or digits (or leave it empty).');
    setError(null);
    setBusy(true);
    try {
      await onPaid(r || undefined);
    } finally {
      setBusy(false);
    }
  };

  const tryApp = async () => {
    const result = await payWithUpi({ payeeUpi, payeeName, amountPaise, note });
    if (result === 'paid') await onPaid(undefined);
  };

  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <Text style={textStyles.strong}>Pay in your UPI app</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.sub}>UPI ID{payeeName ? ` · ${payeeName}` : ''}</Text>
          <Text style={styles.value} selectable>{payeeUpi}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy UPI ID" onPress={() => copy('upi')} style={styles.copy}>
          <Text style={styles.copyText}>{copied === 'upi' ? 'Copied ✓' : 'Copy'}</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={textStyles.sub}>Amount</Text>
          <Text style={styles.value}>{formatINR(amountPaise)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Copy amount" onPress={() => copy('amount')} style={styles.copy}>
          <Text style={styles.copyText}>{copied === 'amount' ? 'Copied ✓' : 'Copy'}</Text>
        </Pressable>
      </View>
      <Text style={textStyles.muted}>
        1. Copy the UPI ID.{'\n'}2. Open GPay / PhonePe → “Pay UPI ID” → paste → pay exactly {formatINR(amountPaise)}.{'\n'}3. Come back and tap “I’ve paid”.
      </Text>
      <TextField label="UPI reference (optional)" value={ref} onChangeText={setRef} placeholder="e.g. 628144103392"
        autoCapitalize="characters" autoCorrect={false} maxLength={40}
        hint="Shown in your UPI app after paying. Saving it gives everyone proof of payment." />
      <ErrorText>{error}</ErrorText>
      <Button title={`I’ve paid ${formatINR(amountPaise)}`} onPress={confirm} loading={busy} />
      {allowAppLaunch ? <Button title="Try opening my UPI app with it filled in" variant="ghost" onPress={tryApp} disabled={busy} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg, borderRadius: radius.md, padding: 12 },
  value: { fontSize: 16, fontWeight: '700', color: colors.ink },
  copy: { height: 40, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', minWidth: 84 },
  copyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
