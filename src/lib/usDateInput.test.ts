import { describe, it, expect } from 'vitest';
import { formatUSDateInput, parseUSDate } from './usDateInput';

/** Simulates typing one character at a time into a formatted field. */
function typeInto(keys: string, start = ''): string {
  let value = start;
  for (const k of keys) value = formatUSDateInput(value + k);
  return value;
}

describe('formatUSDateInput', () => {
  it('inserts the slashes while the user types digits only', () => {
    expect(typeInto('1')).toBe('1');
    expect(typeInto('10')).toBe('10');
    expect(typeInto('102')).toBe('10/2');
    expect(typeInto('1022')).toBe('10/22');
    expect(typeInto('10222')).toBe('10/22/2');
    expect(typeInto('10222026')).toBe('10/22/2026');
  });

  it('ignores digits past the four-digit year', () => {
    expect(typeInto('102220269')).toBe('10/22/2026');
  });

  it('keeps a typed slash and lets it close a one-digit month or day', () => {
    expect(typeInto('1/')).toBe('1/');
    expect(typeInto('1/5/2026')).toBe('1/5/2026');
    expect(typeInto('10/22/2026')).toBe('10/22/2026');
    expect(parseUSDate(typeInto('1/5/2026'))).toBe('2026-01-05');
  });

  it('drops a doubled or leading slash', () => {
    expect(typeInto('10//')).toBe('10/');
    expect(typeInto('/')).toBe('');
  });

  it('lets Backspace remove the slash instead of re-adding it', () => {
    // Backspace from "10/2" leaves "10/", then "10", then "1".
    expect(formatUSDateInput('10/')).toBe('10/');
    expect(formatUSDateInput('10')).toBe('10');
    expect(formatUSDateInput('1')).toBe('1');
    expect(formatUSDateInput('10/22/202')).toBe('10/22/202');
  });

  it('is stable on an already formatted date, including the unpadded locale default', () => {
    expect(formatUSDateInput('10/22/2026')).toBe('10/22/2026');
    expect(formatUSDateInput('1/5/2026')).toBe('1/5/2026');
  });

  it('converts a pasted ISO date and strips stray characters', () => {
    expect(formatUSDateInput('2026-10-22')).toBe('10/22/2026');
    expect(formatUSDateInput('10a22b2026')).toBe('10/22/2026');
    expect(formatUSDateInput('')).toBe('');
  });

  it('produces values the existing parser accepts', () => {
    expect(parseUSDate(typeInto('10222026'))).toBe('2026-10-22');
    expect(parseUSDate(typeInto('01052026'))).toBe('2026-01-05');
  });
});
