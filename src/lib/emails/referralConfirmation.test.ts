import { describe, it, expect } from 'vitest';
import { buildReferralConfirmationHtml } from './referralConfirmationContent';

const MIXED = 'paid family caregiver hours through GAPP may still be possible';
const PHONE = '(470) 635-5774';

describe('referral confirmation email', () => {
  it('adds the mixed-diagnosis paragraph to a paid request with a mixed diagnosis', () => {
    const html = buildReferralConfirmationHtml({
      phone: PHONE,
      seekingPaidCaregiver: true,
      mixedDiagnosis: true,
    });
    expect(html).toContain(MIXED);
    expect(html).toContain('A note about being paid');
  });

  it('leaves it out when the diagnosis is not mixed', () => {
    const html = buildReferralConfirmationHtml({ phone: PHONE, seekingPaidCaregiver: true });
    expect(html).toContain('A note about being paid');
    expect(html).not.toContain(MIXED);
  });

  it('leaves it out when the family is not asking to be paid', () => {
    const html = buildReferralConfirmationHtml({ phone: PHONE, mixedDiagnosis: true });
    expect(html).not.toContain(MIXED);
    expect(html).not.toContain('A note about being paid');
  });

  it('greets by first name', () => {
    const html = buildReferralConfirmationHtml({ phone: PHONE, submitterName: 'Destinee Johnson' });
    expect(html).toContain('Hi Destinee,');
  });
});
