import { describe, expect, it } from 'vitest';
import { normalizeCoordinator, validateCoordinator } from './supportCoordinatorShared';

describe('validateCoordinator', () => {
  it('accepts name, agency, and one way to reach them', () => {
    expect(validateCoordinator({ name: 'Jessie Example', agency: 'Benchmark Human Services', email: 'jexample@example.com' })).toEqual({});
  });

  it('requires name, agency, and a contact', () => {
    expect(Object.keys(validateCoordinator({})).sort()).toEqual(['agency', 'contact', 'name']);
  });

  it('flags a malformed email', () => {
    expect(validateCoordinator({ name: 'A', agency: 'B', email: 'nope' }).email).toBeTruthy();
  });
});

describe('normalizeCoordinator', () => {
  it('trims every field and fills blanks', () => {
    const out = normalizeCoordinator({ name: ' Jessie Example ' });
    expect(out.name).toBe('Jessie Example');
    expect(out.agency).toBe('');
  });
});
