// Users never see raw server errors (they can leak internals). Known codes map to friendly
// text; everything else gets a generic message.

const MESSAGES: Record<string, string> = {
  // Supabase Auth error codes
  over_sms_send_rate_limit: 'Too many codes requested. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  otp_expired: 'That code has expired or is wrong. Request a new one.',
  invalid_credentials: 'That code is wrong. Please check and try again.',
  sms_send_failed: 'We couldn’t send the SMS. Check the number and try again.',
  phone_provider_disabled: 'Phone sign-in is not available right now.',
  captcha_failed: 'Verification failed. Please try again.',
  // Our database function codes (supabase/migrations/*_functions.sql)
  NOT_AUTHENTICATED: 'Please sign in again.',
  NOT_TRIP_MEMBER: 'You’re not a member of this trip.',
  HEAD_ONLY: 'Only the trip Head can do this.',
  TRIP_NOT_ACTIVE: 'This trip has ended, so it can’t be changed.',
  UPI_ID_REQUIRED: 'Add your UPI ID in your profile first.',
  INVITE_NOT_FOUND: 'That invite code isn’t valid or the trip has ended.',
  PAYERS_TOTAL_MISMATCH: 'The amounts paid don’t add up to the total.',
  SPLITS_TOTAL_MISMATCH: 'The split doesn’t add up to the total.',
  UNRESOLVED_ITEMS: 'Resolve the items in the checklist first.',
  REMINDER_RATE_LIMITED: 'You already sent a reminder recently.',
  MEMBER_HAS_ACTIVITY: 'You can’t leave a trip after spending in it.',
};

const GENERIC = 'Something went wrong. Please try again.';

export function friendlyError(error: unknown): string {
  if (!error || typeof error !== 'object') return GENERIC;
  const e = error as { code?: unknown; message?: unknown; status?: unknown };
  if (typeof e.code === 'string' && MESSAGES[e.code]) return MESSAGES[e.code];
  if (typeof e.message === 'string' && MESSAGES[e.message]) return MESSAGES[e.message];
  if (e.message === 'Network request failed') return 'No internet connection.';
  if (__DEV__) console.warn('Unmapped error', e.code ?? e.status ?? 'unknown');
  return GENERIC;
}
