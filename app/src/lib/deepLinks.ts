// Deep-link guard (threat model F1, "malicious deep link freezes the app").
// Every link that opens the app passes through here BEFORE Expo Router parses it,
// because the router's URL decoder (decode-uri-component, GHSA-vcc3-ghjq-m6fr) can be
// made to hang on crafted percent-encoding. We allow-list the few paths we accept and
// rebuild them ourselves; anything else goes to the home route.

export const INVITE_CODE = /^[A-Z]{3}-[A-Z2-9]{4}$/;

const MAX_LENGTH = 256;
const SCHEME = 'traveltogether:';
const WEB_HOST = 'traveltogether.app';

export function sanitizeIncomingPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return '/';
  // Our links never contain percent-encoding, control characters or backslashes.
  if (/[%\\\u0000-\u001f\u007f]/.test(raw)) return '/';

  let path = raw;
  if (raw.includes('://')) {
    const m = /^([a-z][a-z0-9+.-]*:)\/\/([^/?#]*)(\/[^?#]*)?/i.exec(raw);
    if (!m) return '/';
    const [, scheme, host, rest = '/'] = m;
    const isApp = scheme.toLowerCase() === SCHEME;
    const isWeb = scheme.toLowerCase() === 'https:' && host.toLowerCase() === WEB_HOST;
    if (!isApp && !isWeb) return '/';
    // traveltogether://join/ABC-1234 puts "join" in the host position.
    path = isApp && host ? `/${host}${rest === '/' ? '' : rest}` : rest;
  } else {
    path = path.split(/[?#]/)[0];
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 2 && segments[0].toLowerCase() === 'join') {
    const code = segments[1].toUpperCase();
    if (INVITE_CODE.test(code)) return `/join/${code}`;
  }
  return '/';
}
