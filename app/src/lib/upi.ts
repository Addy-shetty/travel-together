// Builds the upi://pay link handed to GPay/PhonePe/etc. (threat model F2–F5, "tampered UPI link").
// The result coming back from the UPI app is never trusted: payments only count once the
// receiver confirms them on the server.
import { isValidUpiId } from './validation.ts';

/** Merchant fields from a scanned QR that may be passed on to the UPI app. Nothing else is (e.g. `url`). */
export const UPI_PASSTHROUGH_FIELDS = new Set(['mc', 'tr', 'tid', 'mode', 'purpose', 'orgid', 'mid', 'msid', 'mtid', 'qrmedium', 'ver']);

export type UpiPayment = {
  payeeUpi: string;
  payeeName: string;
  amountPaise: number;
  note: string;
  /** Allow-listed merchant fields from a scanned QR (see upiQr.ts). */
  extra?: [string, string][];
};

const safeText = (s: string, max: number) => s.replace(/[^A-Za-z0-9 .,'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function buildUpiPayUrl(p: UpiPayment): string {
  if (!isValidUpiId(p.payeeUpi)) throw new Error('INVALID_UPI_ID');
  if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0 || p.amountPaise > 10_00_000_00) {
    throw new Error('INVALID_AMOUNT');
  }
  const amount = `${Math.floor(p.amountPaise / 100)}.${String(p.amountPaise % 100).padStart(2, '0')}`;
  const params: [string, string][] = [
    ['pa', p.payeeUpi.trim()],
    ['pn', safeText(p.payeeName, 50) || 'Travel-Together'],
    ['am', amount],
    ['cu', 'INR'],
    ['tn', safeText(p.note, 50)],
  ];
  for (const [k, v] of p.extra ?? []) {
    if (UPI_PASSTHROUGH_FIELDS.has(k) && !params.some(([key]) => key === k) && /^[A-Za-z0-9._:/+=-]{1,64}$/.test(v)) {
      params.push([k, v]);
    }
  }
  return 'upi://pay?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}
