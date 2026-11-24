import { describe, expect, it } from 'vitest';
import { normalizeGroupHome, validateGroupHome } from './groupHomeShared';

const full = {
  livesIn: 'yes' as const,
  provider: 'Maple Grove Residential, Inc.',
  address: '123 Main St, Decatur, GA 30032',
  contactName: 'Pat Example',
  cell: '404-555-0123',
};

describe('validateGroupHome', () => {
  it('requires a lives-in answer first', () => {
    expect(Object.keys(validateGroupHome({}))).toEqual(['livesIn']);
  });

  it('needs nothing else when the client does not live in a group home', () => {
    expect(validateGroupHome({ livesIn: 'no' })).toEqual({});
  });

  it('accepts a complete record', () => {
    expect(validateGroupHome(full)).toEqual({});
  });

  it('requires provider, address, contact, and a way to reach them', () => {
    const e = validateGroupHome({ livesIn: 'yes' });
    expect(Object.keys(e).sort()).toEqual(['address', 'contact', 'contactName', 'provider']);
  });

  it('rejects a malformed email', () => {
    expect(validateGroupHome({ ...full, email: 'not-an-email' }).email).toBeTruthy();
  });
});

describe('normalizeGroupHome', () => {
  it('trims every field', () => {
    expect(normalizeGroupHome({ ...full, provider: '  Maple Grove  ' }).provider).toBe('Maple Grove');
  });

  it('clears the details when the client does not live in a group home', () => {
    const out = normalizeGroupHome({ ...full, livesIn: 'no' });
    expect(out.livesIn).toBe('no');
    expect(out.provider).toBe('');
    expect(out.cell).toBe('');
  });
});
