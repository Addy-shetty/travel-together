import { sanitizeIncomingPath } from '@/lib/deepLinks';

// Runs on every link that opens the app, before Expo Router parses it. See src/lib/deepLinks.ts.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return sanitizeIncomingPath(path);
  } catch {
    return '/';
  }
}
