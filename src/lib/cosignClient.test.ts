import { describe, expect, it } from 'vitest';
import { credentialRequiresCosign, isRnCredential, licensureFromCredential, needsCosign } from './cosignClient';

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

describe('credentials written in full', () => {
  it('an RN written as "DNP, RN" is an RN and never needs a co-signature', () => {
    expect(needsCosign({ credential: 'DNP, RN', status: 'submitted', cosignedAt: null })).toBe(false);
    expect(needsCosign({ credential: 'BSN RN', status: 'submitted', cosignedAt: null })).toBe(false);
    expect(credentialRequiresCosign('DNP, RN')).toBe(false);
    expect(isRnCredential('rn')).toBe(true);
  });

  it('an LPN written in full still needs one', () => {
    expect(needsCosign({ credential: 'LPN, CPR', status: 'submitted', cosignedAt: null })).toBe(true);
    expect(credentialRequiresCosign('lpn', ['LPN'])).toBe(true);
  });

  it('a blank or unknown credential never needs one', () => {
    expect(credentialRequiresCosign('')).toBe(false);
    expect(credentialRequiresCosign('DNP')).toBe(false);
  });

  it('reduces a credential to its licensure', () => {
    expect(licensureFromCredential('DNP, RN')).toBe('RN');
    expect(licensureFromCredential('LPN')).toBe('LPN');
    expect(licensureFromCredential('RN, LPN')).toBe('RN');
    expect(licensureFromCredential('HHA')).toBeNull();
    expect(licensureFromCredential('')).toBeNull();
  });
});
