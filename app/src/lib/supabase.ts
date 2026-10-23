import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { Database } from './database.types';
import { env } from './env';
import { secureStorage } from './secureStorage';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // never accept tokens from an incoming URL
  },
});

// Refresh tokens only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
