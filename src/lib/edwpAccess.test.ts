import { describe, expect, it } from 'vitest';
import { canUseEdwp } from './edwpAccess';
import { mergeWithDefaults, validateSettings } from './settings';

describe('canUseEdwp', () => {
  it('lets admins in always, and nurses never', () => {
    expect(canUseEdwp({ userUids: [] }, 'a', 'admin')).toBe(true);
    expect(canUseEdwp({ userUids: ['n'] }, 'n', 'nurse')).toBe(false);
  });

  it('keeps the original rule (every VA, no supervisors) until the list is set', () => {
    expect(canUseEdwp({ userUids: null }, 'rosita', 'va')).toBe(true);
    expect(canUseEdwp({ userUids: null }, 'ashley', 'supervisor')).toBe(false);
    expect(canUseEdwp(undefined, 'rosita', 'va')).toBe(true);
  });

  it('follows the saved list once there is one', () => {
    expect(canUseEdwp({ userUids: [] }, 'rosita', 'va')).toBe(false);
    expect(canUseEdwp({ userUids: ['ashley'] }, 'ashley', 'supervisor')).toBe(true);
    expect(canUseEdwp({ userUids: ['ashley'] }, 'rosita', 'va')).toBe(false);
  });

  it('refuses a signed-out caller', () => {
    expect(canUseEdwp({ userUids: null }, '', 'va')).toBe(false);
  });
});

describe('edwp settings', () => {
  it('defaults to "not set" when the stored doc has no edwp entry', () => {
    expect(mergeWithDefaults({}).edwp).toEqual({ userUids: null });
    expect(mergeWithDefaults({ edwp: { userUids: 'x' } }).edwp).toEqual({ userUids: null });
  });

  it('keeps a saved list, de-duplicated, including an empty one', () => {
    expect(mergeWithDefaults({ edwp: { userUids: ['a', 'a', ' b '] } }).edwp).toEqual({ userUids: ['a', 'b'] });
    expect(mergeWithDefaults({ edwp: { userUids: [] } }).edwp).toEqual({ userUids: [] });
  });

  it('validates a save', () => {
    expect(validateSettings({ edwp: { userUids: ['a'] } }).edwp).toEqual({ userUids: ['a'] });
    expect(validateSettings({ edwp: { userUids: null } }).edwp).toEqual({ userUids: null });
    expect(() => validateSettings({ edwp: { userUids: [1] } })).toThrow(/edwp/);
  });
});
