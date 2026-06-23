// Pure config + decision logic for auto-closing stale "Referred Out" referrals.
// No 'server-only' and no Firestore, so it's directly unit-testable. The
// Firestore-backed sweep (autoCloseStaleReferredOut) lives in referrals.ts.

const DAY_MS = 86_400_000;

/**
 * Days a referral may sit in "Referred Out" before the daily sweep moves it to
 * "Closed". Overridable via REFERRAL_AUTO_CLOSE_DAYS; defaults to 14.
 */
export const REFERRED_OUT_AUTO_CLOSE_DAYS = Number(process.env.REFERRAL_AUTO_CLOSE_DAYS) || 14;

/**
 * Whether a referral that entered "Referred Out" at `enteredMs` is old enough to
 * auto-close as of `nowMs`. Undateable cards (null) are never closed, so a
 * missing timestamp can't trigger a surprise archive.
 */
export function isStaleReferredOut(
  enteredMs: number | null,
  nowMs: number,
  days: number
): boolean {
  if (enteredMs == null) return false;
  return enteredMs <= nowMs - days * DAY_MS;
}
