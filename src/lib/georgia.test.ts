import { describe, it, expect } from 'vitest';
import { GA_COUNTIES, normalizeCounty, serviceFromCareNeed, SERVICE_KEYS } from './georgia';

describe('GA_COUNTIES', () => {
  it('has exactly the 159 Georgia counties, no duplicates', () => {
    expect(GA_COUNTIES).toHaveLength(159);
    expect(new Set(GA_COUNTIES).size).toBe(159);
  });

  it('includes the metro counties referrals actually come from', () => {
    for (const c of ['Fulton', 'DeKalb', 'Cobb', 'Clayton', 'Henry', 'Gwinnett']) {
      expect(GA_COUNTIES).toContain(c);
    }
  });
});

describe('normalizeCounty', () => {
  it('canonicalizes case and trailing "County"', () => {
    expect(normalizeCounty('dekalb')).toBe('DeKalb');
    expect(normalizeCounty('DeKalb County')).toBe('DeKalb');
    expect(normalizeCounty('  fulton  ')).toBe('Fulton');
  });

  it('rejects non-Georgia counties and blanks', () => {
    expect(normalizeCounty('Los Angeles')).toBeNull();
    expect(normalizeCounty('')).toBeNull();
    expect(normalizeCounty(null)).toBeNull();
    expect(normalizeCounty(undefined)).toBeNull();
  });
});

describe('serviceFromCareNeed', () => {
  it('maps the stored referral-form labels to service keys', () => {
    expect(serviceFromCareNeed('Hands-on personal care')).toBe('pss');
    expect(serviceFromCareNeed('Skilled medical / nursing care')).toBe('nursing');
    expect(serviceFromCareNeed('Behavioral / autism support')).toBe('behavioral');
  });

  it('returns null for "Not sure", blanks, and unknown text', () => {
    expect(serviceFromCareNeed('Not sure')).toBeNull();
    expect(serviceFromCareNeed('')).toBeNull();
    expect(serviceFromCareNeed(undefined)).toBeNull();
  });

  it('service keys stay in sync with the canonical list', () => {
    expect(SERVICE_KEYS).toEqual(['nursing', 'pss', 'behavioral']);
  });
});
