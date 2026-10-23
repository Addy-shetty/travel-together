import { Alert, Linking } from 'react-native';
import { formatINR } from './money';
import { buildUpiPayUrl, type UpiPayment } from './upi';

const ask = (title: string, message: string, no: string, yes: string): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: false });
  });

// UPI apps often refuse payments to *personal* UPI IDs started from another app ("limit exceeded").
// Paying inside the UPI app directly usually works, so we always offer that route.
const payManually = (p: UpiPayment) => ask(
  'Pay manually',
  `Open your UPI app and pay ${formatINR(p.amountPaise)} to\n\n${p.payeeUpi}${p.payeeName ? `\n(${p.payeeName})` : ''}\n\nThen come back and tap “I’ve paid”.`,
  'Cancel',
  'I’ve paid',
);

/**
 * Opens the phone's UPI app with a prefilled payment, then asks whether it went through, with a
 * manual fallback. The answer is only a claim: receivers confirm on the server before money counts.
 * `rawUrl` is used for signed merchant QRs, which must be passed on exactly as scanned.
 */
export async function payWithUpi(p: UpiPayment, opts: { rawUrl?: string } = {}): Promise<'paid' | 'not_paid'> {
  let url: string;
  try {
    url = opts.rawUrl ?? buildUpiPayUrl(p);
  } catch {
    Alert.alert('Can’t pay this UPI ID', 'The UPI ID looks invalid. Ask the receiver to check it.');
    return 'not_paid';
  }
  try {
    await Linking.openURL(url);
  } catch {
    return (await payManually(p)) ? 'paid' : 'not_paid';
  }
  if (await ask('Did the payment go through?', 'Check your UPI app.', 'No, it failed', 'Yes, paid')) return 'paid';
  return (await payManually(p)) ? 'paid' : 'not_paid';
}

export function confirmAction(title: string, message: string, confirmText: string, destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
