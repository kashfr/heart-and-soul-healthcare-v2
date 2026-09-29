import { describe, expect, it } from 'vitest';
import { normalizeCoordinator, validateCoordinator } from './supportCoordinatorShared';

describe('validateCoordinator', () => {
  it('accepts name, agency, and one way to reach them', () => {
    expect(validateCoordinator({ name: 'Jasmine Lawrence', agency: 'Benchmark Human Services', email: 'jlawrence@benchmarkhs.com' })).toEqual({});
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
    const out = normalizeCoordinator({ name: ' Jasmine Lawrence ' });
    expect(out.name).toBe('Jasmine Lawrence');
    expect(out.agency).toBe('');
  });
});
