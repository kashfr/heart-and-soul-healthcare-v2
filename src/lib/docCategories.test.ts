import { describe, expect, it } from 'vitest';
import { isDocCategory, validateFileFaxToClient } from './docCategories';

const ok = { patientId: 'QNCpGaEQdp0Us1gk5hL4', category: 'Specialist / Physician Visit', title: 'Piedmont Endocrinology visit note', docDate: '2026-08-21' };

describe('validateFileFaxToClient', () => {
  it('accepts a complete filing', () => {
    expect(validateFileFaxToClient(ok, '2026-09-29')).toEqual({});
  });

  it('requires a client, a real category, a title, and a date', () => {
    expect(Object.keys(validateFileFaxToClient({}, '2026-09-29')).sort()).toEqual(['category', 'docDate', 'patientId', 'title']);
    expect(validateFileFaxToClient({ ...ok, category: 'Random' }, '2026-09-29').category).toBeTruthy();
  });

  it('accepts a referral id from the GAPP site intake (ext_ plus a hash)', () => {
    expect(validateFileFaxToClient({ ...ok, patientId: 'ext_3c55b3ac2958422a8d3b82771a74f32d1234abcd' }, '2026-09-29')).toEqual({});
  });

  it('rejects a future document date', () => {
    expect(validateFileFaxToClient({ ...ok, docDate: '2026-10-01' }, '2026-09-29').docDate).toBeTruthy();
  });
});

describe('isDocCategory', () => {
  it('knows the load-bearing names', () => {
    expect(isDocCategory('RN Oversight')).toBe(true);
    expect(isDocCategory('rn oversight')).toBe(false);
  });
});
