// Input validation shared by screens. The database enforces the same rules again;
// these exist for fast feedback and to stop obviously bad requests (e.g. SMS to foreign numbers).

/** Indian mobile numbers only: 10 digits starting 6–9, optional +91 / 91 / 0 prefix. Returns E.164 or null. */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '');
  const m = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}

/** "+919876543210" -> "+91 98765 43210" */
export function formatIndianMobile(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

// Same pattern as the profiles.upi_id CHECK constraint in the database.
const UPI_ID = /^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$/;

export function isValidUpiId(input: string): boolean {
  return UPI_ID.test(input.trim());
}

export function isValidOtp(input: string): boolean {
  return /^\d{6}$/.test(input);
}

/** UPI reference / UTR from the payer's UPI app: optional, letters and digits only. Returns null if invalid. */
export function normalizeUpiRef(input: string): string | null {
  const s = input.replace(/\s/g, '');
  if (s === '') return '';
  return /^[A-Za-z0-9]{6,35}$/.test(s) ? s : null;
}

export function cleanName(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function isValidEmail(input: string): boolean {
  return input.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.trim());
}
