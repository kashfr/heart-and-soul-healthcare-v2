import { describe, expect, it } from 'vitest';
import { needsCosign } from './cosignClient';

describe('needsCosign', () => {
  // The helper takes a Pick<SubmissionSummary, ...> so these literal objects
  // exercise it directly without needing to construct a full SubmissionSummary.

  it('returns true for an un-cosigned HHA note', () => {
    expect(needsCosign({ credential: 'HHA', status: 'submitted', cosignedAt: null })).toBe(true);
  });

  it('returns true for an un-cosigned CNA note', () => {
    expect(needsCosign({ credential: 'CNA', status: 'submitted', cosignedAt: null })).toBe(true);
  });

  it('returns true for an un-cosigned LPN note', () => {
    expect(needsCosign({ credential: 'LPN', status: 'submitted', cosignedAt: null })).toBe(true);
  });

  it('returns false for RN notes regardless of cosign state', () => {
    expect(needsCosign({ credential: 'RN', status: 'submitted', cosignedAt: null })).toBe(false);
  });

  it('returns false once a Date is set on cosignedAt', () => {
    expect(needsCosign({ credential: 'LPN', status: 'submitted', cosignedAt: new Date() })).toBe(false);
  });

  it('returns false for non-submitted notes', () => {
    expect(needsCosign({ credential: 'LPN', status: 'draft', cosignedAt: null })).toBe(false);
  });

  it('returns false when credential is missing (legacy notes)', () => {
    expect(needsCosign({ credential: '', status: 'submitted', cosignedAt: null })).toBe(false);
  });

  it('returns false for unknown credentials', () => {
    expect(needsCosign({ credential: 'MD', status: 'submitted', cosignedAt: null })).toBe(false);
  });

  // --- Override-driven behavior (settings-backed) ---

  it('honors a settings-derived required-credentials Set', () => {
    // Admin removed LPN from the cosign list via /admin/settings.
    const required = new Set(['HHA', 'CNA']);
    expect(
      needsCosign({ credential: 'LPN', status: 'submitted', cosignedAt: null }, required),
    ).toBe(false);
    expect(
      needsCosign({ credential: 'CNA', status: 'submitted', cosignedAt: null }, required),
    ).toBe(true);
  });

  it('accepts a plain array as the required-credentials override', () => {
    expect(
      needsCosign({ credential: 'CNA', status: 'submitted', cosignedAt: null }, ['CNA']),
    ).toBe(true);
    expect(
      needsCosign({ credential: 'HHA', status: 'submitted', cosignedAt: null }, ['CNA']),
    ).toBe(false);
  });

  it('treats an empty required-credentials override as "no notes need cosign"', () => {
    // Edge case: org has no RN, admin disabled the requirement entirely.
    expect(
      needsCosign({ credential: 'CNA', status: 'submitted', cosignedAt: null }, []),
    ).toBe(false);
  });
});
