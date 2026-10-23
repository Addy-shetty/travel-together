import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatINR, paiseToInput } from '@/lib/money';
import { payWithUpi } from '@/lib/pay';
import { normalizeUpiRef } from '@/lib/validation';
import { Button, ErrorText, TextField } from './components';
import { Card, Segmented, textStyles } from './kit';
import { colors, radius } from './theme';
import { UpiQrCode, type UpiQrProps } from './UpiQrCode';

type Tab = 'qr' | 'app' | 'manual';

type Props = UpiQrProps & {
  onPaid: (upiRef: string | undefined) => Promise<void>;
};

export function UpiPaymentSheet({ payeeUpi, payeeName, amountPaise, note, onPaid }: Props) {
  const [tab, setTab] = useState<Tab>('qr');
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState<'upi' | 'amount' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async (what: 'upi' | 'amount') => {
    await Clipboard.setStringAsync(what === 'upi' ? payeeUpi : paiseToInput(amountPaise));
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };

  const confirmManual = async () => {
    const r = normalizeUpiRef(ref);
    if (r === null) {
      setError('The UPI reference should be 6–35 letters or digits (or leave it empty).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onPaid(r || undefined);
    } finally {
      setBusy(false);
    }
  };

  const launchApp = async () => {
    setBusy(true);
    try {
      const result = await payWithUpi({ payeeUpi, payeeName, amountPaise, note });
      if (result === 'paid') {
        await onPaid(undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmFromQr = async () => {
    const r = normalizeUpiRef(ref);
    if (r === null && ref.trim() !== '') {
      setError('The UPI reference should be 6–35 letters or digits (or leave it empty).');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onPaid(r || undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Segmented
        options={[
          { key: 'qr', label: 'Scan QR' },
          { key: 'app', label: 'Open App' },
          { key: 'manual', label: 'Manual' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'qr' && (
        <>
          <UpiQrCode
            payeeUpi={payeeUpi}
            payeeName={payeeName}
            amountPaise={amountPaise}
            note={note}
          />
          <Card style={{ padding: 16, gap: 12 }}>
            <TextField
              label="UPI Transaction ID (optional)"
              value={ref}
              onChangeText={setRef}
              placeholder="e.g. 628144103392"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={40}
              hint="Enter the UTR from your UPI app after paying for proof of payment."
            />
            <ErrorText>{error}</ErrorText>
            <Button
              title={`I've paid ${formatINR(amountPaise)}`}
              onPress={confirmFromQr}
              loading={busy}
            />
          </Card>
        </>
      )}

      {tab === 'app' && (
        <Card style={{ padding: 16, gap: 14 }}>
          <Text style={textStyles.strong}>Pay with UPI App</Text>
          <Text style={textStyles.muted}>
            Opens your default UPI app with the payment pre-filled. After paying, come back to confirm.
          </Text>
          <View style={styles.infoRow}>
            <Text style={textStyles.sub}>To</Text>
            <Text style={textStyles.strong}>{payeeName || payeeUpi}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={textStyles.sub}>UPI ID</Text>
            <Text style={textStyles.body}>{payeeUpi}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={textStyles.sub}>Amount</Text>
            <Text style={[textStyles.strong, { fontSize: 18 }]}>{formatINR(amountPaise)}</Text>
          </View>
          <Button
            title={`Pay ${formatINR(amountPaise)}`}
            onPress={launchApp}
            loading={busy}
          />
          <Text style={[textStyles.muted, { textAlign: 'center', fontSize: 12 }]}>
            Note: Some UPI apps may decline payments to personal IDs initiated from other apps.
            Use {'"'}Manual{'"'} if this happens.
          </Text>
        </Card>
      )}

      {tab === 'manual' && (
        <Card style={{ padding: 16, gap: 12 }}>
          <Text style={textStyles.strong}>Pay in your UPI app</Text>
          <View style={styles.copyRow}>
            <View style={{ flex: 1 }}>
              <Text style={textStyles.sub}>UPI ID{payeeName ? ` · ${payeeName}` : ''}</Text>
              <Text style={styles.value} selectable>{payeeUpi}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy UPI ID"
              onPress={() => copy('upi')}
              style={styles.copyBtn}
            >
              <Text style={styles.copyText}>{copied === 'upi' ? 'Copied ✓' : 'Copy'}</Text>
            </Pressable>
          </View>
          <View style={styles.copyRow}>
            <View style={{ flex: 1 }}>
              <Text style={textStyles.sub}>Amount</Text>
              <Text style={styles.value}>{formatINR(amountPaise)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy amount"
              onPress={() => copy('amount')}
              style={styles.copyBtn}
            >
              <Text style={styles.copyText}>{copied === 'amount' ? 'Copied ✓' : 'Copy'}</Text>
            </Pressable>
          </View>
          <Text style={textStyles.muted}>
            1. Copy the UPI ID.{'\n'}
            2. Open GPay / PhonePe → {'"'}Pay UPI ID{'"'} → paste → pay exactly {formatINR(amountPaise)}.{'\n'}
            3. Come back and tap {'"'}I{"'"}ve paid{'"'}.
          </Text>
          <TextField
            label="UPI Transaction ID (optional)"
            value={ref}
            onChangeText={setRef}
            placeholder="e.g. 628144103392"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
            hint="Shown in your UPI app after paying. Saving it gives everyone proof of payment."
          />
          <ErrorText>{error}</ErrorText>
          <Button title={`I've paid ${formatINR(amountPaise)}`} onPress={confirmManual} loading={busy} />
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: 12,
  },
  value: { fontSize: 16, fontWeight: '700', color: colors.ink },
  copyBtn: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 84,
  },
  copyText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
