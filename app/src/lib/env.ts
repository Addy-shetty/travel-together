// Public configuration only. EXPO_PUBLIC_* values are compiled into the app and visible
// to anyone who unpacks it, so they must never be secrets (see .env.example).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase config: copy app/.env.example to app/.env.local');
}
if (!__DEV__ && !supabaseUrl.startsWith('https://')) {
  throw new Error('Supabase URL must use HTTPS in release builds');
}
// Guard against the most damaging mistake: shipping a key that bypasses row level security.
if (supabaseKey.startsWith('sb_secret_') || supabaseKey.includes('c2VydmljZV9yb2xl')) {
  throw new Error('A secret / service_role key must never be bundled into the app');
}

export const env = { supabaseUrl, supabaseKey } as const;
