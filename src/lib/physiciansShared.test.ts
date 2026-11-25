import { describe, expect, it } from 'vitest';
import { normalizePhysicians, validatePhysicians } from './physiciansShared';

describe('validatePhysicians', () => {
  it('accepts a complete row', () => {
    expect(validatePhysicians([{ id: 'a', name: 'Dr. Jamie Sample', specialty: 'Endocrinology', fax: '404-555-0115' }])).toEqual({});
  });

  it('requires name and specialty per row', () => {
    const e = validatePhysicians([{ id: 'a', name: '', specialty: '' }]);
    expect(e.a.name).toBeTruthy();
    expect(e.a.specialty).toBeTruthy();
  });

  it('flags a fax that is not 10 digits', () => {
    expect(validatePhysicians([{ id: 'a', name: 'X', specialty: 'Podiatry', fax: '555-1234' }]).a.fax).toBeTruthy();
  });
});

describe('normalizePhysicians', () => {
  it('formats the fax and puts primary care first', () => {
    const out = normalizePhysicians([
      { id: 'e', name: ' Dr. Sample ', specialty: 'Endocrinology', fax: '4045550115' },
      { id: 'p', name: 'Dr. Kaufman', specialty: 'Primary Care' },
    ]);
    expect(out[0].id).toBe('p');
    expect(out[1].name).toBe('Dr. Sample');
    expect(out[1].fax).toBe('(404) 555-0115');
  });
});
