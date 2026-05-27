import 'server-only';
import { adminDb } from '@/lib/firebaseAdmin';
import { mergeWithDefaults, type AppSettings } from '@/lib/settings';

/**
 * Server-side reader for the settings/global doc. Used by API routes
 * and server components that can't reach the React `useSettings` hook.
 * Returns the merged-with-defaults shape so callers never have to
 * worry about missing fields.
 *
 * Note: no in-memory caching here. Next.js serverless functions are
 * short-lived; the per-request Firestore read is cheap enough not to
 * warrant cache invalidation complexity. If load ever pushes us
 * toward caching, do it at the Vercel ISR layer rather than in
 * module-level globals.
 */
export async function getServerSettings(): Promise<AppSettings> {
  const snap = await adminDb().doc('settings/global').get();
  return mergeWithDefaults(snap.exists ? snap.data() : null);
}
