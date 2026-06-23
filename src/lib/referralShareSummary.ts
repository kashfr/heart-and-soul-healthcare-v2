// Pure, framework-free logic for agency-share status and roll-ups. No
// 'server-only' import and no Firestore — so this is directly unit-testable and
// safe to import anywhere. The Firestore-backed `summarizeSharesByReferral`
// (which reads the docs and feeds `foldShareSummaries`) lives in referralShares.ts.

export type ShareStatus = 'active' | 'viewed' | 'expired' | 'revoked';

/** Status precedence for a single share: revoked > expired > viewed > active. */
export function deriveShareStatus(
  revokedAtMs: number | null,
  expiresAtMs: number | null,
  viewCount: number,
  nowMs: number
): ShareStatus {
  if (revokedAtMs != null) return 'revoked';
  if (expiresAtMs != null && nowMs > expiresAtMs) return 'expired';
  if (viewCount > 0) return 'viewed';
  return 'active';
}

/**
 * A compact, per-referral roll-up of its shares, for the board/table "Shared"
 * badge. `live` counts shares with a still-usable link (active or viewed);
 * `status` is the aggregate signal:
 *   - 'viewed'   at least one live link the partner has opened
 *   - 'active'   at least one live link, none opened yet
 *   - 'inactive' shares exist but no live link (all expired/revoked)
 * Referrals with no shares get no entry (so the badge simply doesn't render).
 */
export interface ReferralShareSummary {
  total: number;
  live: number;
  status: 'active' | 'viewed' | 'inactive';
  lastSharedAt: string | null;
}

/** One share's fields needed to fold it into a summary. */
export interface ShareSummaryRow {
  referralId: string;
  revokedAtMs: number | null;
  expiresAtMs: number | null;
  viewCount: number;
  createdMs: number | null;
}

/**
 * Pure grouping of share rows into per-referral summaries (no Firestore).
 * Mirrors the status precedence of deriveShareStatus.
 */
export function foldShareSummaries(
  rows: ShareSummaryRow[],
  nowMs: number
): Record<string, ReferralShareSummary> {
  const acc: Record<string, { total: number; live: number; viewed: number; lastMs: number }> = {};
  for (const row of rows) {
    if (!row.referralId) continue;
    const status = deriveShareStatus(row.revokedAtMs, row.expiresAtMs, row.viewCount, nowMs);
    const entry = (acc[row.referralId] ??= { total: 0, live: 0, viewed: 0, lastMs: 0 });
    entry.total += 1;
    if (status === 'active' || status === 'viewed') entry.live += 1;
    if (status === 'viewed') entry.viewed += 1;
    if (row.createdMs && row.createdMs > entry.lastMs) entry.lastMs = row.createdMs;
  }
  const out: Record<string, ReferralShareSummary> = {};
  for (const [id, e] of Object.entries(acc)) {
    out[id] = {
      total: e.total,
      live: e.live,
      status: e.live > 0 ? (e.viewed > 0 ? 'viewed' : 'active') : 'inactive',
      lastSharedAt: e.lastMs ? new Date(e.lastMs).toISOString() : null,
    };
  }
  return out;
}
