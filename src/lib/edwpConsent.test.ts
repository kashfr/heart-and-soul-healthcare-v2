import { describe, it, expect } from 'vitest';
import {
  EMPTY_EDWP_CONSENT,
  normalizeEdwpConsent,
  serviceLabels,
  validateEdwpConsent,
  type EdwpConsentInput,
} from './edwpConsent';

// A tiny but real PNG data URL (1x1 transparent pixel).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const valid: EdwpConsentInput = {
  ...EMPTY_EDWP_CONSENT,
  clientName: 'Mary Johnson',
  dob: '1948-03-12',
  address: '12 Oak St, Atlanta, GA 30309',
  phone: '(404) 555-0100',
  program: 'ccsp',
  agreed: true,
  signerType: 'client',
  signerName: 'Mary Johnson',
  signature: PNG,
};

describe('validateEdwpConsent', () => {
  it('accepts a complete client-signed form', () => {
    expect(validateEdwpConsent(valid)).toEqual({});
  });

  it('requires the core client fields, program, agreement, and signature', () => {
    const errors = validateEdwpConsent(EMPTY_EDWP_CONSENT);
    expect(Object.keys(errors).sort()).toEqual(
      ['address', 'agreed', 'clientName', 'dob', 'phone', 'program', 'signature', 'signerName'].sort()
    );
  });

  it('requires a relationship when a representative signs', () => {
    const errors = validateEdwpConsent({ ...valid, signerType: 'representative', signerName: 'Ann Johnson' });
    expect(errors.signerRelationship).toBeTruthy();
    expect(
      validateEdwpConsent({ ...valid, signerType: 'representative', signerName: 'Ann Johnson', signerRelationship: 'Daughter' })
    ).toEqual({});
  });

  it('requires a description when "other" is among the services', () => {
    expect(validateEdwpConsent({ ...valid, services: ['other'] }).servicesOther).toBeTruthy();
    expect(validateEdwpConsent({ ...valid, services: ['other'], servicesOther: 'Meal prep' })).toEqual({});
  });

  it('rejects a future date of birth and a malformed email', () => {
    expect(validateEdwpConsent({ ...valid, dob: '2999-01-01' }).dob).toBeTruthy();
    expect(validateEdwpConsent({ ...valid, email: 'not-an-email' }).email).toBeTruthy();
    expect(validateEdwpConsent({ ...valid, email: 'mary@example.com' })).toEqual({});
  });

  it('only accepts a PNG data URL as the signature', () => {
    expect(validateEdwpConsent({ ...valid, signature: 'data:image/svg+xml;base64,PHN2Zz4=' }).signature).toBeTruthy();
    expect(validateEdwpConsent({ ...valid, signature: 'https://evil.example/x.png' }).signature).toBeTruthy();
  });
});

describe('normalizeEdwpConsent', () => {
  it('trims strings, drops unknown keys, and dedupes services', () => {
    const out = normalizeEdwpConsent({
      clientName: '  Mary Johnson ',
      services: ['pss', 'pss', 'nursing'],
      agreed: 'yes',
      signerType: 'bogus',
      extra: 'ignored',
    });
    expect(out.clientName).toBe('Mary Johnson');
    expect(out.services).toEqual(['pss', 'nursing']);
    expect(out.agreed).toBe(false); // only a literal true counts
    expect(out.signerType).toBe('client');
    expect('extra' in out).toBe(false);
  });

  it('survives garbage input', () => {
    expect(normalizeEdwpConsent(null).clientName).toBe('');
    expect(normalizeEdwpConsent('x').services).toEqual([]);
  });
});

describe('serviceLabels', () => {
  it('expands "other" to the typed description', () => {
    expect(serviceLabels(['pss', 'other'], 'Meal prep')).toEqual(['Personal Support Services', 'Other: Meal prep']);
  });
});
