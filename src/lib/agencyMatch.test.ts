import { describe, it, expect } from 'vitest';
import {
  matchAgencies,
  matchAgenciesBulk,
  summarizePartnerMatches,
  topSuggestions,
  type MatchableAgency,
} from './agencyMatch';

function agency(over: Partial<MatchableAgency> & { name: string }): MatchableAgency {
  return { id: over.name.toLowerCase(), email: `${over.name.toLowerCase()}@x.com`, counties: [], services: [], ...over };
}

const FULL = agency({ name: 'FullMatch', counties: ['Henry', 'Fulton'], services: ['pss', 'nursing'] });
const COUNTY_ONLY = agency({ name: 'CountyOnly', counties: ['Henry'], services: ['behavioral'] });
const WRONG_COUNTY = agency({ name: 'WrongCounty', counties: ['Chatham'], services: ['pss'] });
const NO_DATA = agency({ name: 'NoData' });

describe('matchAgencies', () => {
  it('ranks county+service above county-only above unknown', () => {
    const out = matchAgencies({ county: 'Henry', service: 'pss' }, [NO_DATA, COUNTY_ONLY, FULL]);
    expect(out.map((m) => m.agency.name)).toEqual(['FullMatch', 'CountyOnly', 'NoData']);
  });

  it('excludes agencies whose known counties do not cover the referral', () => {
    const out = matchAgencies({ county: 'Henry', service: 'pss' }, [WRONG_COUNTY, FULL]);
    expect(out.map((m) => m.agency.name)).toEqual(['FullMatch']);
  });

  it('drops the service reason when the agency covers county but not the need', () => {
    const out = matchAgencies({ county: 'Henry', service: 'pss' }, [COUNTY_ONLY]);
    expect(out[0].reasons).toEqual(['Covers Henry']);
    expect(out[0].serviceMatch).toBe(false);
  });

  it('normalizes the referral county ("henry county" still matches)', () => {
    const out = matchAgencies({ county: 'henry county', service: null }, [FULL]);
    expect(out[0].reasons).toEqual(['Covers Henry']);
  });

  it('matches on service alone when the county is unknown', () => {
    const out = matchAgencies({ county: '', service: 'pss' }, [FULL, COUNTY_ONLY]);
    expect(out[0].agency.name).toBe('FullMatch');
    expect(out[0].reasons).toEqual(['PSS']);
  });

  it('reason badge uses the short service code', () => {
    const out = matchAgencies({ county: 'Henry', service: 'behavioral' }, [COUNTY_ONLY]);
    expect(out[0].reasons).toEqual(['Covers Henry', 'BSS']);
  });
});

describe('matchAgenciesBulk', () => {
  const inputs = [
    { county: 'Henry', service: 'pss' as const },
    { county: 'Fulton', service: 'nursing' as const },
    { county: 'Chatham', service: null },
  ];

  it('scores by counties covered across the batch', () => {
    const out = matchAgenciesBulk(inputs, [FULL, COUNTY_ONLY]);
    expect(out[0].agency.name).toBe('FullMatch');
    expect(out[0].reasons[0]).toBe('Covers 2 of 3 counties');
  });

  it('uses the plain county name when the batch has one county', () => {
    const out = matchAgenciesBulk([{ county: 'Henry', service: null }], [COUNTY_ONLY]);
    expect(out[0].reasons).toEqual(['Covers Henry']);
  });

  it('excludes agencies covering none of the batch counties', () => {
    const out = matchAgenciesBulk(
      [{ county: 'Henry', service: null }],
      [WRONG_COUNTY, COUNTY_ONLY]
    );
    expect(out.map((m) => m.agency.name)).toEqual(['CountyOnly']);
  });
});

describe('summarizePartnerMatches', () => {
  it('counts every positive match, not just the top 3', () => {
    const many = ['A', 'B', 'C', 'D'].map((n) =>
      agency({ name: n, counties: ['Henry'], services: ['pss'] })
    );
    const out = summarizePartnerMatches({ county: 'Henry', service: 'pss' }, many);
    expect(out).toMatchObject({ level: 'match', count: 4, label: '4 partners' });
  });

  it('names the top 3 in the detail and tallies the remainder', () => {
    const many = ['A', 'B', 'C', 'D'].map((n) =>
      agency({ name: n, counties: ['Henry'], services: ['pss'] })
    );
    const out = summarizePartnerMatches({ county: 'Henry', service: 'pss' }, many);
    expect(out?.detail).toBe(
      'A (Covers Henry · PSS); B (Covers Henry · PSS); C (Covers Henry · PSS); +1 more'
    );
  });

  it('uses the singular label for one match', () => {
    const out = summarizePartnerMatches({ county: 'Henry', service: 'pss' }, [FULL]);
    expect(out?.label).toBe('1 partner');
  });

  it('reports no match when every saved agency is ruled out on known data', () => {
    const out = summarizePartnerMatches({ county: 'Henry', service: 'pss' }, [WRONG_COUNTY]);
    expect(out).toMatchObject({ level: 'none', count: 0, label: 'No partner match' });
    expect(out?.detail).toBe(
      'No saved partner covers Henry for Personal Support Services (PSS)'
    );
  });

  it('stays silent when the only candidates are unknowns', () => {
    // NO_DATA has no counties or services on file — thin records are not a miss.
    expect(summarizePartnerMatches({ county: 'Henry', service: 'pss' }, [NO_DATA])).toBeNull();
  });

  it('stays silent when there is nothing to match on', () => {
    expect(summarizePartnerMatches({ county: '', service: null }, [FULL])).toBeNull();
    expect(summarizePartnerMatches({ county: 'Nowhere', service: null }, [FULL])).toBeNull();
  });

  it('stays silent when no agencies are saved', () => {
    expect(summarizePartnerMatches({ county: 'Henry', service: 'pss' }, [])).toBeNull();
  });

  it('matches on county alone when the care need is unstated', () => {
    const out = summarizePartnerMatches({ county: 'Henry', service: null }, [COUNTY_ONLY]);
    expect(out).toMatchObject({ level: 'match', count: 1 });
    expect(out?.detail).toBe('CountyOnly (Covers Henry)');
  });

  it('names the service when the county is unknown and nobody offers the need', () => {
    const out = summarizePartnerMatches({ county: '', service: 'behavioral' }, [FULL]);
    expect(out?.detail).toBe(
      'No saved partner agency offers Behavioral Support Aide Services (BSS)'
    );
  });
});

describe('topSuggestions', () => {
  it('keeps only positive-evidence matches, capped at 3', () => {
    const matches = matchAgencies({ county: 'Henry', service: 'pss' }, [
      FULL, COUNTY_ONLY, NO_DATA,
      agency({ name: 'Also', counties: ['Henry'], services: ['pss'] }),
      agency({ name: 'More', counties: ['Henry'], services: [] }),
    ]);
    const top = topSuggestions(matches);
    expect(top).toHaveLength(3);
    // The pure unknown (no reasons) never makes the suggestion row.
    expect(top.every((m) => m.reasons.length > 0)).toBe(true);
    expect(top.some((m) => m.agency.name === 'NoData')).toBe(false);
  });
});
