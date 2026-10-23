import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { formatINR } from '@/lib/money';
import { buildUpiPayUrl } from '@/lib/upi';
import { Card, textStyles } from './kit';
import { colors, radius } from './theme';

export type UpiQrProps = {
  payeeUpi: string;
  payeeName: string;
  amountPaise: number;
  note: string;
};

export function UpiQrCode({ payeeUpi, payeeName, amountPaise, note }: UpiQrProps) {
  const [error, setError] = useState(false);

  let url: string;
  try {
    url = buildUpiPayUrl({ payeeUpi, payeeName, amountPaise, note });
  } catch {
    return (
      <Card style={styles.container}>
        <Text style={textStyles.muted}>Invalid UPI ID — cannot generate QR code.</Text>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={styles.container}>
        <Text style={textStyles.muted}>Could not generate QR code.</Text>
      </Card>
    );
  }

  return (
    <Card style={styles.container}>
      <Text style={textStyles.strong}>Scan to Pay</Text>
      <View style={styles.qrWrapper}>
        <QRCode
          value={url}
          size={200}
          backgroundColor="#FFFFFF"
          color={colors.ink}
          onError={() => setError(true)}
        />
      </View>
      <View style={styles.details}>
        <View style={styles.row}>
          <Text style={textStyles.sub}>To</Text>
          <Text style={textStyles.strong}>{payeeName || payeeUpi}</Text>
        </View>
        <View style={styles.row}>
          <Text style={textStyles.sub}>Amount</Text>
          <Text style={[textStyles.strong, { fontSize: 18 }]}>{formatINR(amountPaise)}</Text>
        </View>
      </View>
      <Text style={[textStyles.muted, { textAlign: 'center' }]}>
        Open any UPI app (GPay, PhonePe, Paytm){'\n'}and scan this QR code
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: 'center', gap: 16 },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  details: { width: '100%', gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
});
