// Parser for scanned UPI QR codes (threat model F6). QR content is attacker-controlled:
// only `upi://pay?…` is accepted, parameters are allow-listed, duplicates and non-INR are
// rejected, and nothing else (web links, intents, deep links) is ever opened.
import { parseRupees } from './money.ts';
import { UPI_PASSTHROUGH_FIELDS as PASSTHROUGH } from './upi.ts';
import { isValidUpiId } from './validation.ts';

export type ScannedUpi = {
  payeeUpi: string;
  payeeName: string;
  amountPaise: number | null; // fixed by the QR, or null when the payer enters it
  note: string;
  merchantCode: string | null; // NPCI merchant category code; present on shop QRs
  isMerchant: boolean;
  signed: boolean; // signed QRs must be passed on unchanged
  raw: string;
  passthrough: [string, string][]; // allow-listed merchant fields kept for the UPI app
};

export type ParseResult = { ok: true; value: ScannedUpi } | { ok: false; reason: 'NOT_UPI' | 'INVALID' };

const MAX_LENGTH = 1024;
const KNOWN = new Set(['pa', 'pn', 'am', 'cu', 'tn', 'sign', 'mam', 'url', 'refurl', ...PASSTHROUGH]);
const SAFE_VALUE = /^[A-Za-z0-9._:/+=-]{1,64}$/;

const displayText = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

export function parseUpiQr(input: unknown): ParseResult {
  if (typeof input !== 'string') return { ok: false, reason: 'INVALID' };
  const raw = input.trim();
  if (raw.length === 0 || raw.length > MAX_LENGTH) return { ok: false, reason: 'INVALID' };
  const m = /^upi:\/\/pay\?(.*)$/i.exec(raw);
  if (!m) return { ok: false, reason: 'NOT_UPI' };

  const params = new Map<string, string>();
  for (const part of m[1].split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq <= 0) return { ok: false, reason: 'INVALID' };
    const key = part.slice(0, eq).toLowerCase();
    let value: string;
    try {
      value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' '));
    } catch {
      return { ok: false, reason: 'INVALID' };
    }
    if (params.has(key)) return { ok: false, reason: 'INVALID' }; // parameter smuggling
    if (KNOWN.has(key)) params.set(key, value);
  }

  const pa = (params.get('pa') ?? '').trim();
  if (!isValidUpiId(pa)) return { ok: false, reason: 'INVALID' };

  const cu = params.get('cu');
  if (cu !== undefined && cu.toUpperCase() !== 'INR') return { ok: false, reason: 'INVALID' };

  let amountPaise: number | null = null;
  const am = params.get('am');
  if (am !== undefined && am.trim() !== '') {
    amountPaise = parseRupees(am);
    if (amountPaise === null) return { ok: false, reason: 'INVALID' };
  }

  const mc = params.get('mc') ?? null;
  if (mc !== null && !/^\d{4}$/.test(mc)) return { ok: false, reason: 'INVALID' };

  const passthrough: [string, string][] = [];
  for (const [k, v] of params) {
    if (PASSTHROUGH.has(k) && SAFE_VALUE.test(v)) passthrough.push([k, v]);
  }

  return {
    ok: true,
    value: {
      payeeUpi: pa,
      payeeName: displayText(params.get('pn') ?? '', 60),
      amountPaise,
      note: displayText(params.get('tn') ?? '', 60),
      merchantCode: mc,
      isMerchant: mc !== null && mc !== '0000',
      signed: params.has('sign'),
      raw,
      passthrough,
    },
  };
}
