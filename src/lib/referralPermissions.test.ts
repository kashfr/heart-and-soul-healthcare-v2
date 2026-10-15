import { describe, expect, it } from 'vitest';
import { canCreateClientFromReferral } from './referralPermissions';
import { mergeWithDefaults } from './settings';

describe('referral client creation permission', () => {
  it('preserves staff access but denies VAs by default', () => {
    const settings = mergeWithDefaults(null).referralConversion;
    expect(canCreateClientFromReferral(settings, 'a', 'admin')).toBe(true);
    expect(canCreateClientFromReferral(settings, 's', 'supervisor')).toBe(true);
    expect(canCreateClientFromReferral(settings, 'v', 'va')).toBe(false);
  });
  it('grants only the selected VA and supports revocation', () => {
    expect(canCreateClientFromReferral({ userUids: ['v'] }, 'v', 'va')).toBe(true);
    expect(canCreateClientFromReferral({ userUids: ['v'] }, 'other', 'va')).toBe(false);
    expect(canCreateClientFromReferral({ userUids: [] }, 'v', 'va')).toBe(false);
    expect(canCreateClientFromReferral({ userUids: ['v'] }, 'v', 'nurse')).toBe(false);
    expect(canCreateClientFromReferral({ userUids: ['v'] }, null, 'admin')).toBe(false);
  });
  it('fails closed for old or malformed persisted settings', () => {
    expect(mergeWithDefaults({ referralConversion: { userUids: null } }).referralConversion.userUids).toEqual([]);
    expect(mergeWithDefaults({ referralConversion: { userUids: [' v ', 'v', 123] } }).referralConversion.userUids).toEqual(['v']);
    expect(canCreateClientFromReferral(undefined, 'v', 'va')).toBe(false);
  });
});
