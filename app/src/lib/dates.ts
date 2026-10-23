const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14/11/2026" -> "2026-11-14", or null if it is not a real calendar date. */
export function parseDisplayDate(input: string): string | null {
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > daysInMonth) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2026-11-14" -> "14 Nov" */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTHS[m - 1]}`;
}

export function dateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return 'Dates not set';
  if (!end || end === start) return shortDate(start);
  const [, sm] = start.split('-');
  const [, em] = end.split('-');
  return sm === em ? `${Number(start.slice(8, 10))}–${shortDate(end)}` : `${shortDate(start)} – ${shortDate(end)}`;
}

/** Timestamp -> "15 Nov, 4:12 pm" in the phone's time zone. */
export function dateTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${mins} ${h < 12 ? 'am' : 'pm'}`;
}
