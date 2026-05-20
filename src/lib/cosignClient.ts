/**
 * Pure client-side helpers around the RN co-signature feature. Lives in its
 * own module (no Firebase imports) so the logic can be unit-tested without
 * dragging in the Firebase SDK initialization.
 */

/** Credentials whose notes require an RN to co-sign. RN notes are exempt. */
export const COSIGN_REQUIRED_CREDENTIALS = new Set(['HHA', 'CNA', 'LPN']);

/**
 * True when a note still needs an RN co-signature.
 *
 * - RN-authored notes never need co-sign.
 * - Legacy notes with no credential are treated as not requiring it.
 * - Only submitted notes are eligible (drafts and other statuses skip).
 */
export function needsCosign(s: {
  credential: string;
  status: string;
  cosignedAt: Date | null;
}): boolean {
  if (s.status !== 'submitted') return false;
  if (s.cosignedAt != null) return false;
  return COSIGN_REQUIRED_CREDENTIALS.has(s.credential);
}
