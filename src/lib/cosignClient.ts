/**
 * Pure client-side helpers around the RN co-signature feature. Lives in its
 * own module (no Firebase imports) so the logic can be unit-tested without
 * dragging in the Firebase SDK initialization.
 */

/**
 * Default credentials whose notes require an RN to co-sign. Used as
 * the fallback when no overrides are passed — preserves the original
 * behavior for callers that haven't been threaded through settings yet
 * (and for the server-side cosignServer.ts which reads settings on
 * its own). Admin can override via /admin/settings; the resolved list
 * comes through the optional `requiredCredentials` parameter below.
 */
export const COSIGN_REQUIRED_CREDENTIALS = new Set(['HHA', 'CNA', 'LPN']);

/**
 * True when a note still needs an RN co-signature.
 *
 * - RN-authored notes never need co-sign.
 * - Legacy notes with no credential are treated as not requiring it.
 * - Only submitted notes are eligible (drafts and other statuses skip).
 *
 * `requiredCredentials` is optional so legacy call sites (and tests
 * that don't care about settings) keep working. Callers with access
 * to settings should pass the configured list so admin changes to
 * /admin/settings take effect immediately.
 */
export function needsCosign(
  s: {
    credential: string;
    status: string;
    cosignedAt: Date | null;
  },
  requiredCredentials?: ReadonlySet<string> | readonly string[],
): boolean {
  if (s.status !== 'submitted') return false;
  if (s.cosignedAt != null) return false;
  const required = requiredCredentials
    ? requiredCredentials instanceof Set
      ? requiredCredentials
      : new Set(requiredCredentials)
    : COSIGN_REQUIRED_CREDENTIALS;
  return required.has(s.credential);
}
