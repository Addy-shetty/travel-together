// Money is stored as smallest currency unit (paise for INR, cents for USD, etc.).
// No floating point touches an amount.

export const MAX_PAISE = 10_00_000_00; // ₹10,00,000 per entry

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'THB' | 'MYR' | 'IDR' | 'JPY' | 'AUD' | 'CAD';

export const CURRENCIES: Record<CurrencyCode, { symbol: string; decimals: number; name: string }> = {
  INR: { symbol: '₹', decimals: 2, name: 'Indian Rupee' },
  USD: { symbol: '$', decimals: 2, name: 'US Dollar' },
  EUR: { symbol: '€', decimals: 2, name: 'Euro' },
  GBP: { symbol: '£', decimals: 2, name: 'British Pound' },
  AED: { symbol: 'د.إ', decimals: 2, name: 'UAE Dirham' },
  SGD: { symbol: 'S$', decimals: 2, name: 'Singapore Dollar' },
  THB: { symbol: '฿', decimals: 2, name: 'Thai Baht' },
  MYR: { symbol: 'RM', decimals: 2, name: 'Malaysian Ringgit' },
  IDR: { symbol: 'Rp', decimals: 0, name: 'Indonesian Rupiah' },
  JPY: { symbol: '¥', decimals: 0, name: 'Japanese Yen' },
  AUD: { symbol: 'A$', decimals: 2, name: 'Australian Dollar' },
  CAD: { symbol: 'C$', decimals: 2, name: 'Canadian Dollar' },
};

/** "1,200.5" -> 120050. Returns null for anything that is not a plain positive rupee amount. */
export function parseRupees(input: string): number | null {
  const s = input.replace(/[₹,\s]/g, '');
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return paise > 0 && paise <= MAX_PAISE ? paise : null;
}

/** 12345650 -> "₹1,23,456.50"; whole rupees drop the decimals. Indian digit grouping. */
export function formatINR(paise: number, opts: { signed?: boolean } = {}): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100).toString();
  const rest = abs % 100;
  const grouped = rupees.length > 3
    ? rupees.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + rupees.slice(-3)
    : rupees;
  const body = '₹' + grouped + (rest ? '.' + String(rest).padStart(2, '0') : '');
  if (negative) return '−' + body;
  return opts.signed && paise > 0 ? '+' + body : body;
}

/** 120050 -> "1200.50" for a text field the user can edit. */
export function paiseToInput(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p ? `${r}.${String(p).padStart(2, '0')}` : String(r);
}

/** Format amount in any supported currency. Uses appropriate grouping and decimals. */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  opts: { signed?: boolean } = {}
): string {
  const { symbol, decimals } = CURRENCIES[currency];
  const negative = amount < 0;
  const abs = Math.abs(Math.trunc(amount));
  const divisor = Math.pow(10, decimals);
  const major = Math.floor(abs / divisor);
  const minor = abs % divisor;

  // Use Indian grouping for INR, standard grouping for others
  let grouped: string;
  if (currency === 'INR') {
    const s = major.toString();
    grouped = s.length > 3
      ? s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3)
      : s;
  } else {
    grouped = major.toLocaleString('en-US');
  }

  const body = symbol + grouped + (decimals > 0 && minor ? '.' + String(minor).padStart(decimals, '0') : '');
  if (negative) return '−' + body;
  return opts.signed && amount > 0 ? '+' + body : body;
}

/** Parse amount string to smallest unit for a currency. Returns null if invalid. */
export function parseAmount(input: string, currency: CurrencyCode): number | null {
  const { decimals } = CURRENCIES[currency];
  const s = input.replace(/[^\d.]/g, '');

  if (decimals === 0) {
    const m = /^(\d{1,12})$/.exec(s);
    if (!m) return null;
    const val = Number(m[1]);
    return val > 0 ? val : null;
  }

  const m = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const amount = Number(m[1]) * Math.pow(10, decimals) + Number((m[2] ?? '').padEnd(decimals, '0'));
  return amount > 0 ? amount : null;
}

/** Convert amount from smallest unit to input string for editing. */
export function amountToInput(amount: number, currency: CurrencyCode): string {
  const { decimals } = CURRENCIES[currency];
  if (decimals === 0) return String(amount);
  const divisor = Math.pow(10, decimals);
  const major = Math.floor(amount / divisor);
  const minor = amount % divisor;
  return minor ? `${major}.${String(minor).padStart(decimals, '0')}` : String(major);
}
