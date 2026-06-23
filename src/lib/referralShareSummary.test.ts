import { describe, it, expect } from 'vitest';
import { foldShareSummaries, type ShareSummaryRow } from './referralShareSummary';

const NOW = 1_000_000_000;
const FUTURE = NOW + 86_400_000; // link still valid
const PAST = NOW - 86_400_000; // link expired

function row(over: Partial<ShareSummaryRow> & { referralId: string }): ShareSummaryRow {
  return {
    revokedAtMs: null,
    expiresAtMs: FUTURE,
    viewCount: 0,
    createdMs: NOW,
    ...over,
  };
}

describe('foldShareSummaries', () => {
  it('returns an empty map for no rows', () => {
    expect(foldShareSummaries([], NOW)).toEqual({});
  });

  it('skips rows with no referralId', () => {
    expect(foldShareSummaries([row({ referralId: '' })], NOW)).toEqual({});
  });

  it('marks a single unopened live link as active', () => {
    const out = foldShareSummaries([row({ referralId: 'r1' })], NOW);
    expect(out.r1).toMatchObject({ total: 1, live: 1, status: 'active' });
  });

  it('marks an opened live link as viewed', () => {
    const out = foldShareSummaries([row({ referralId: 'r1', viewCount: 3 })], NOW);
    expect(out.r1).toMatchObject({ total: 1, live: 1, status: 'viewed' });
  });

  it('aggregates to viewed when any live share has been opened', () => {
    const out = foldShareSummaries(
      [
        row({ referralId: 'r1' }), // active
        row({ referralId: 'r1', viewCount: 1 }), // viewed
      ],
      NOW
    );
    expect(out.r1).toMatchObject({ total: 2, live: 2, status: 'viewed' });
  });

  it('treats an expired-only link as inactive (no live link)', () => {
    const out = foldShareSummaries([row({ referralId: 'r1', expiresAtMs: PAST })], NOW);
    expect(out.r1).toMatchObject({ total: 1, live: 0, status: 'inactive' });
  });

  it('treats a revoked link as inactive even if not expired', () => {
    const out = foldShareSummaries([row({ referralId: 'r1', revokedAtMs: NOW - 1 })], NOW);
    expect(out.r1).toMatchObject({ total: 1, live: 0, status: 'inactive' });
  });

  it('counts only live shares in `live` but all shares in `total`', () => {
    const out = foldShareSummaries(
      [
        row({ referralId: 'r1' }), // live/active
        row({ referralId: 'r1', expiresAtMs: PAST }), // dead
        row({ referralId: 'r1', revokedAtMs: NOW - 1 }), // dead
      ],
      NOW
    );
    expect(out.r1).toMatchObject({ total: 3, live: 1, status: 'active' });
  });

  it('reports the most recent share time as lastSharedAt', () => {
    const out = foldShareSummaries(
      [
        row({ referralId: 'r1', createdMs: NOW - 5000 }),
        row({ referralId: 'r1', createdMs: NOW - 1000 }),
      ],
      NOW
    );
    expect(out.r1.lastSharedAt).toBe(new Date(NOW - 1000).toISOString());
  });

  it('keeps referrals independent', () => {
    const out = foldShareSummaries(
      [row({ referralId: 'r1' }), row({ referralId: 'r2', expiresAtMs: PAST })],
      NOW
    );
    expect(out.r1.status).toBe('active');
    expect(out.r2.status).toBe('inactive');
  });
});
