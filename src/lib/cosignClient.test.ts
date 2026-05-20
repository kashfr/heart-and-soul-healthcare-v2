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
});
