// Session storage backed by the OS keystore (iOS Keychain / Android Keystore), not AsyncStorage,
// so auth tokens are encrypted at rest (threat model F1, "session theft").
// SecureStore can reject large values, and a Supabase session is several KB, so values
// are split into chunks: <key>.n holds the chunk count, <key>.0 … <key>.n-1 the data.
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 32;
const options: SecureStore.SecureStoreOptions = {
  // Only readable while the phone is unlocked, and never restored onto another device.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// SecureStore keys may contain only alphanumerics, ".", "-" and "_".
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function chunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(`${key}.n`, options);
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= MAX_CHUNKS ? n : 0;
}

export const secureStorage = {
  async getItem(name: string): Promise<string | null> {
    const key = safeKey(name);
    const n = await chunkCount(key);
    if (n === 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`, options);
      if (part === null) return null; // incomplete write: treat as signed out
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(name: string, value: string): Promise<void> {
    const key = safeKey(name);
    const n = Math.ceil(value.length / CHUNK_SIZE);
    if (n > MAX_CHUNKS) throw new Error('Value too large for secure storage');
    await this.removeItem(name);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), options);
    }
    // Written last, so a half-finished write is never read back as a session.
    await SecureStore.setItemAsync(`${key}.n`, String(n), options);
  },

  async removeItem(name: string): Promise<void> {
    const key = safeKey(name);
    const n = await chunkCount(key);
    await SecureStore.deleteItemAsync(`${key}.n`, options);
    for (let i = 0; i < Math.max(n, 1); i++) {
      await SecureStore.deleteItemAsync(`${key}.${i}`, options);
    }
  },
};
