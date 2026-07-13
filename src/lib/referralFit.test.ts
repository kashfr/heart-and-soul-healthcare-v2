import { describe, it, expect } from 'vitest';
import { assessReferralFit } from './referralFit';
import type { IntakeSettings } from './settings';

// Mirrors the user's real profile shape: skilled nursing only, metro counties.
const PROFILE: IntakeSettings = {
  counties: ['Fulton', 'DeKalb', 'Henry'],
  services: ['nursing'],
};

describe('assessReferralFit', () => {
  it('good fit: in-area county + offered service', () => {
    const fit = assessReferralFit({ county: 'Henry', service: 'nursing' }, PROFILE);
    expect(fit?.level).toBe('good');
    expect(fit?.detail).toContain('Henry');
  });

  it('not a fit: out-of-area county, even with an offered service', () => {
    const fit = assessReferralFit({ county: 'Chatham', service: 'nursing' }, PROFILE);
    expect(fit?.level).toBe('none');
    expect(fit?.detail).toContain('outside your service area');
  });

  it('not a fit: service not offered, even in-area', () => {
    const fit = assessReferralFit({ county: 'Fulton', service: 'pss' }, PROFILE);
    expect(fit?.level).toBe('none');
    expect(fit?.detail).toContain("don't offer");
  });

  it('possible fit: in-area but care need unknown', () => {
    const fit = assessReferralFit({ county: 'Fulton', service: null }, PROFILE);
    expect(fit?.level).toBe('partial');
  });

  it('possible fit: service offered but county unrecognized', () => {
    const fit = assessReferralFit({ county: '', service: 'nursing' }, PROFILE);
    expect(fit?.level).toBe('partial');
  });

  it('normalizes county text ("henry county")', () => {
    const fit = assessReferralFit({ county: 'henry county', service: 'nursing' }, PROFILE);
    expect(fit?.level).toBe('good');
  });

  it('returns null when there is nothing to judge', () => {
    expect(assessReferralFit({ county: '', service: null }, PROFILE)).toBeNull();
    expect(
      assessReferralFit({ county: 'Fulton', service: 'nursing' }, { counties: [], services: [] })
    ).toBeNull();
  });
});
