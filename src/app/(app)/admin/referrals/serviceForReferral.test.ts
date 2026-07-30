import { describe, it, expect } from 'vitest';
import { matchInputFor, serviceForReferral, type Referral } from './types';

// serviceForReferral is the single point every board verdict now reads through
// (fit badge, partner badge, both filters, the share pickers, the CSV export),
// so its fallback behaviour is what keeps pre-structured-intake referrals from
// silently losing their service line.

function referral(over: Partial<Referral>): Referral {
  return {
    id: 'r1',
    source: 'gapp-website',
    stage: 'new',
    status: 'new',
    order: 0,
    assigneeUid: null,
    assigneeName: null,
    statusUpdatedBy: null,
    statusUpdatedByName: null,
    clientName: 'Test Child',
    clientEmail: 't@example.com',
    clientPhone: '(404) 555-0100',
    county: 'DeKalb',
    program: 'GAPP - Georgia Pediatric Program',
    details: [],
    submittedAt: null,
    updatedAt: null,
    ...over,
  };
}

const careNeedRow = (value: string) => [{ label: 'Primary care need', value }];

describe('serviceForReferral', () => {
  it('prefers the service inferred at intake', () => {
    const r = referral({
      service: 'behavioral',
      details: careNeedRow('Hands-on personal care'),
    });
    expect(serviceForReferral(r)).toBe('behavioral');
  });

  it('falls back to the care-need row on referrals predating structured intake', () => {
    // No `service` field at all — the shape of all 59 referrals taken before
    // the checkbox form existed.
    const r = referral({ details: careNeedRow('Skilled medical / nursing care') });
    expect(serviceForReferral(r)).toBe('nursing');
  });

  it('falls back when the inference came up empty rather than reading null as "no need"', () => {
    const r = referral({ service: null, details: careNeedRow('Hands-on personal care') });
    expect(serviceForReferral(r)).toBe('pss');
  });

  it('returns null when neither source says anything', () => {
    expect(serviceForReferral(referral({}))).toBeNull();
    expect(serviceForReferral(referral({ details: careNeedRow('Not sure') }))).toBeNull();
  });

  it('is unfazed by a referral with no details at all', () => {
    expect(serviceForReferral(referral({ details: [] }))).toBeNull();
  });
});

describe('staff override contract', () => {
  // What the drawer's "Care need" select relies on: setting a value wins over
  // whatever the family selected, and clearing it hands the card back to the
  // form's answer rather than blanking the service line.
  it('an override beats a contradicting care-need row', () => {
    const r = referral({
      service: 'behavioral',
      details: careNeedRow('Hands-on personal care'),
    });
    expect(serviceForReferral(r)).toBe('behavioral');
  });

  it('clearing the override restores the form answer, it does not blank the line', () => {
    const cleared = referral({ service: null, details: careNeedRow('Hands-on personal care') });
    expect(serviceForReferral(cleared)).toBe('pss');
  });

  it('clearing on a referral with no form answer leaves it genuinely unknown', () => {
    const cleared = referral({ service: null, details: [] });
    expect(serviceForReferral(cleared)).toBeNull();
  });

  it('every service line is settable', () => {
    for (const svc of ['nursing', 'pss', 'behavioral'] as const) {
      expect(serviceForReferral(referral({ service: svc }))).toBe(svc);
    }
  });
});

describe('matchInputFor', () => {
  it('pairs the county with the resolved service', () => {
    const r = referral({ county: 'Henry', service: 'pss' });
    expect(matchInputFor(r)).toEqual({ county: 'Henry', service: 'pss' });
  });

  it('reproduces the referral that started this work', () => {
    // DeKalb, autism, family picked hands-on personal care. Before structured
    // intake the board could only see PSS and offered every DeKalb agency;
    // now the inferred BSS line rides through to the partner matcher, where
    // Reaching Clarity is the only qualifying partner.
    const r = referral({
      county: 'DeKalb',
      service: 'behavioral',
      details: careNeedRow('Hands-on personal care'),
    });
    expect(matchInputFor(r)).toEqual({ county: 'DeKalb', service: 'behavioral' });
  });
});
