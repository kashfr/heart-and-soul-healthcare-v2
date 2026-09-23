import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { referralPortalButtonHtml, referralPortalUrl } from './referralPortalLink';

describe('referral portal deep link', () => {
  it('points at the board with the card to open', () => {
    expect(referralPortalUrl('ext_abc123')).toBe(
      'https://www.heartandsoulhc.org/admin/referrals?open=ext_abc123'
    );
  });

  it('encodes the id so a stray character cannot break the URL', () => {
    expect(referralPortalUrl('a b&c')).toBe(
      'https://www.heartandsoulhc.org/admin/referrals?open=a%20b%26c'
    );
  });

  it('renders a clickable button with that link', () => {
    const html = referralPortalButtonHtml('ext_abc123');
    expect(html).toContain('href="https://www.heartandsoulhc.org/admin/referrals?open=ext_abc123"');
    expect(html).toContain('Open this referral in the portal');
  });
});
