import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  mergeWithDefaults,
  validateSettings,
  SettingsValidationError,
} from './settings';

describe('mergeWithDefaults', () => {
  it('returns defaults when given null', () => {
    expect(mergeWithDefaults(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when given undefined', () => {
    expect(mergeWithDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults when given an empty object', () => {
    expect(mergeWithDefaults({})).toEqual(DEFAULT_SETTINGS);
  });

  it('fills in missing leaves without clobbering present ones', () => {
    const partial = { submissions: { defaultSort: 'clientName' as const } };
    const merged = mergeWithDefaults(partial);
    expect(merged.submissions.defaultSort).toBe('clientName');
    expect(merged.submissions.defaultDir).toBe(DEFAULT_SETTINGS.submissions.defaultDir);
    expect(merged.submissions.pageSize).toBe(DEFAULT_SETTINGS.submissions.pageSize);
  });

  it('clamps an out-of-range pageSize', () => {
    expect(mergeWithDefaults({ submissions: { pageSize: 1 } }).submissions.pageSize).toBe(5);
    expect(mergeWithDefaults({ submissions: { pageSize: 9999 } }).submissions.pageSize).toBe(100);
  });

  it('preserves a boolean false on rnDefaultsToNeedsCosign', () => {
    // Regression: `value ?? default` would let `false` survive, but a
    // naïve `value || default` would silently switch it back to true.
    const merged = mergeWithDefaults({
      submissions: { rnDefaultsToNeedsCosign: false },
    });
    expect(merged.submissions.rnDefaultsToNeedsCosign).toBe(false);
  });
});

describe('validateSettings', () => {
  it('passes a full valid payload through (after merge)', () => {
    const merged = validateSettings({
      submissions: {
        defaultSort: 'submittedAt',
        defaultDir: 'asc',
        defaultScope: 'all',
        pageSize: 50,
        rnDefaultsToNeedsCosign: false,
      },
    });
    expect(merged.submissions.defaultSort).toBe('submittedAt');
    expect(merged.submissions.defaultDir).toBe('asc');
    expect(merged.submissions.defaultScope).toBe('all');
    expect(merged.submissions.pageSize).toBe(50);
    expect(merged.submissions.rnDefaultsToNeedsCosign).toBe(false);
  });

  it('rejects an invalid sort key', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ submissions: { defaultSort: 'bogus' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects an invalid sort direction', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ submissions: { defaultDir: 'sideways' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects an invalid scope', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ submissions: { defaultScope: 'orphan' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects a non-numeric pageSize', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ submissions: { pageSize: 'twenty' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects a non-boolean rnDefaultsToNeedsCosign', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ submissions: { rnDefaultsToNeedsCosign: 'yes' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('accepts a valid cosign.requiredCredentials list', () => {
    const merged = validateSettings({ cosign: { requiredCredentials: ['CNA', 'LPN'] } });
    expect(merged.cosign.requiredCredentials).toEqual(['CNA', 'LPN']);
  });

  it('accepts an empty cosign.requiredCredentials list', () => {
    // Edge case: org has no RN on staff so they disable cosign entirely.
    const merged = validateSettings({ cosign: { requiredCredentials: [] } });
    expect(merged.cosign.requiredCredentials).toEqual([]);
  });

  it('rejects RN in cosign.requiredCredentials', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ cosign: { requiredCredentials: ['RN' as any] } }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects unknown credential strings', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ cosign: { requiredCredentials: ['MD' as any] } }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects non-array cosign.requiredCredentials', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ cosign: { requiredCredentials: 'CNA' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('accepts boolean false for patient.allowFreeText', () => {
    const merged = validateSettings({ patient: { allowFreeText: false } });
    expect(merged.patient.allowFreeText).toBe(false);
  });

  it('rejects non-boolean patient.allowFreeText', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      validateSettings({ patient: { allowFreeText: 'no' as any } }),
    ).toThrow(SettingsValidationError);
  });

  it('accepts a valid vital range override', () => {
    const merged = validateSettings({
      vitals: { rangesByAgeGroup: { preschool: { temperature: { low: 96.5, high: 99.5 } } } },
    });
    expect(merged.vitals.rangesByAgeGroup.preschool?.temperature).toEqual({
      low: 96.5,
      high: 99.5,
    });
  });

  it('rejects an unknown age group in vital overrides', () => {
    expect(() =>
      validateSettings({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vitals: { rangesByAgeGroup: { martian: {} } as any },
      }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects low > high in vital overrides', () => {
    expect(() =>
      validateSettings({
        vitals: { rangesByAgeGroup: { adult: { pulse: { low: 200, high: 50 } } } },
      }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects non-numeric low/high in vital overrides', () => {
    expect(() =>
      validateSettings({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vitals: { rangesByAgeGroup: { adult: { pulse: { low: 'sixty' as any, high: 100 } } } },
      }),
    ).toThrow(SettingsValidationError);
  });
});

describe('mergeWithDefaults — new settings fields', () => {
  it('fills in default cosign + patient + vitals when absent', () => {
    const merged = mergeWithDefaults({ submissions: { defaultSort: 'clientName' as const } });
    expect(merged.cosign.requiredCredentials).toEqual(['HHA', 'CNA', 'LPN']);
    expect(merged.patient.allowFreeText).toBe(true);
    expect(merged.vitals.rangesByAgeGroup).toEqual({});
  });

  it('dedupes and filters unknown credentials in cosign list', () => {
    // Defensive: a malformed Firestore doc shouldn't crash callers.
    const merged = mergeWithDefaults({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cosign: { requiredCredentials: ['CNA', 'CNA', 'RN' as any, 'MD' as any, 'LPN'] },
    });
    expect(merged.cosign.requiredCredentials).toEqual(['CNA', 'LPN']);
  });

  it('drops vital pairs with low > high', () => {
    const merged = mergeWithDefaults({
      vitals: {
        rangesByAgeGroup: {
          adult: {
            pulse: { low: 200, high: 50 },
            temperature: { low: 97, high: 99 },
          },
        },
      },
    });
    expect(merged.vitals.rangesByAgeGroup.adult?.pulse).toBeUndefined();
    expect(merged.vitals.rangesByAgeGroup.adult?.temperature).toEqual({ low: 97, high: 99 });
  });

  it('fills in default branding when absent', () => {
    const merged = mergeWithDefaults({});
    expect(merged.branding.orgName).toBe('Heart and Soul Healthcare');
    expect(merged.branding.tagline).toBe('Compassionate Care, Professional Excellence');
    expect(merged.branding.fromEmailDisplay).toBe('Heart and Soul Healthcare');
  });

  it('trims orgName and ignores empty-string overrides', () => {
    const merged = mergeWithDefaults({ branding: { orgName: '   ' as string } });
    // Empty/whitespace orgName falls back to the default rather than
    // leaving the sidebar / PDF blank.
    expect(merged.branding.orgName).toBe('Heart and Soul Healthcare');
  });

  it('preserves a trimmed orgName override', () => {
    const merged = mergeWithDefaults({ branding: { orgName: '  Acme Home Health  ' as string } });
    expect(merged.branding.orgName).toBe('Acme Home Health');
  });

  it('fills in default email subjects when absent', () => {
    const merged = mergeWithDefaults({});
    expect(merged.emails.subjects.staffInviteWelcome).toMatch(/Welcome/);
    expect(merged.emails.subjects.emailChanged).toMatch(/email was changed/);
  });
});

describe('validateSettings — branding + emails', () => {
  it('rejects an empty orgName', () => {
    expect(() => validateSettings({ branding: { orgName: '' } })).toThrow(SettingsValidationError);
  });

  it('rejects an oversized orgName', () => {
    expect(() => validateSettings({ branding: { orgName: 'x'.repeat(100) } })).toThrow(
      SettingsValidationError,
    );
  });

  it('accepts a valid branding update', () => {
    const merged = validateSettings({
      branding: { orgName: 'Acme', tagline: 'Hello', fromEmailDisplay: 'Acme Notifications' },
    });
    expect(merged.branding.orgName).toBe('Acme');
    expect(merged.branding.fromEmailDisplay).toBe('Acme Notifications');
  });

  it('rejects an empty email subject', () => {
    expect(() =>
      validateSettings({ emails: { subjects: { staffInviteWelcome: '   ' } } as never }),
    ).toThrow(SettingsValidationError);
  });

  it('rejects an oversized email subject', () => {
    expect(() =>
      validateSettings({
        emails: { subjects: { emailChanged: 'x'.repeat(250) } } as never,
      }),
    ).toThrow(SettingsValidationError);
  });
});
