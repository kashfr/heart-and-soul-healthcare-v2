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
 * The credential tokens in a free-text credential string: "DNP, RN" gives
 * ['DNP', 'RN'], "lpn" gives ['LPN']. Splits on commas, slashes, and
 * whitespace; upper-cases; drops empties.
 */
export function credentialTokens(credential: string | null | undefined): string[] {
  return String(credential || '')
    .split(/[\s,\/;]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
}

/** True when the credential names an RN anywhere ("RN", "DNP, RN", "BSN RN"). */
export const isRnCredential = (credential: string | null | undefined): boolean =>
  credentialTokens(credential).includes('RN');

/** 'RN' or 'LPN' when the credential names one, else null. RN wins over LPN. */
export function licensureFromCredential(credential: string | null | undefined): 'RN' | 'LPN' | null {
  const tokens = credentialTokens(credential);
  if (tokens.includes('RN')) return 'RN';
  if (tokens.includes('LPN')) return 'LPN';
  return null;
}

/**
 * Whether a note signed with this credential needs an RN co-signature. An RN
 * (however the credential is written) never does; otherwise, any token in
 * the required list does. A blank credential (legacy notes) never does.
 */
export function credentialRequiresCosign(
  credential: string | null | undefined,
  requiredCredentials?: ReadonlySet<string> | readonly string[],
): boolean {
  const required = requiredCredentials
    ? requiredCredentials instanceof Set
      ? requiredCredentials
      : new Set(requiredCredentials)
    : COSIGN_REQUIRED_CREDENTIALS;
  const tokens = credentialTokens(credential);
  if (tokens.includes('RN')) return false;
  return tokens.some((t) => required.has(t));
}

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
  return credentialRequiresCosign(s.credential, requiredCredentials);
}
