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
});
