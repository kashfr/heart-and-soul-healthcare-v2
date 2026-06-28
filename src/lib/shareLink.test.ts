import { describe, it, expect } from 'vitest';
import { buildShareUrl, SHARE_SITE_URL } from './shareLink';

describe('buildShareUrl', () => {
  it('builds the public share URL on the production origin', () => {
    expect(buildShareUrl('abc123')).toBe(
      'https://www.heartandsoulhc.org/shared/referral/abc123'
    );
  });

  it('always uses the canonical site origin', () => {
    expect(SHARE_SITE_URL).toBe('https://www.heartandsoulhc.org');
    expect(buildShareUrl('t')).toMatch(/^https:\/\/www\.heartandsoulhc\.org\/shared\/referral\//);
  });

  it('never produces a localhost link', () => {
    expect(buildShareUrl('t')).not.toContain('localhost');
  });
});
