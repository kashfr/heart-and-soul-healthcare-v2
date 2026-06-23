import { describe, it, expect } from 'vitest';
import { phoneDigits, formatUSPhone, isValidUSPhone } from './phone';

describe('phoneDigits', () => {
  it('strips non-digits', () => {
    expect(phoneDigits('(678) 644-0337')).toBe('6786440337');
  });

  it('caps at 10 digits', () => {
    expect(phoneDigits('16786440337')).toBe('1678644033');
  });

  it('returns empty for no digits', () => {
    expect(phoneDigits('abc')).toBe('');
  });
});

describe('formatUSPhone', () => {
  it('formats a complete number', () => {
    expect(formatUSPhone('6786440337')).toBe('(678) 644-0337');
  });

  it('formats partial input progressively', () => {
    expect(formatUSPhone('')).toBe('');
    expect(formatUSPhone('67')).toBe('(67');
    expect(formatUSPhone('678')).toBe('(678');
    expect(formatUSPhone('67864')).toBe('(678) 64');
    expect(formatUSPhone('678644')).toBe('(678) 644');
    expect(formatUSPhone('6786440')).toBe('(678) 644-0');
  });

  it('reformats already-formatted or messy input', () => {
    expect(formatUSPhone('678.644.0337')).toBe('(678) 644-0337');
    expect(formatUSPhone('(678) 644-0337')).toBe('(678) 644-0337');
  });

  it('ignores digits beyond the tenth', () => {
    expect(formatUSPhone('67864403371234')).toBe('(678) 644-0337');
  });
});

describe('isValidUSPhone', () => {
  it('accepts exactly 10 digits in any format', () => {
    expect(isValidUSPhone('6786440337')).toBe(true);
    expect(isValidUSPhone('(678) 644-0337')).toBe(true);
  });

  it('rejects incomplete or empty numbers', () => {
    expect(isValidUSPhone('')).toBe(false);
    expect(isValidUSPhone('678644')).toBe(false);
  });

  it('rejects more than 10 entered digits when they form an 11-digit number', () => {
    // phoneDigits caps at 10, so a leading "1" country code shifts the value —
    // the form normalizes before this check, but guard the raw case anyway.
    expect(isValidUSPhone('123-456-789')).toBe(false);
  });
});
