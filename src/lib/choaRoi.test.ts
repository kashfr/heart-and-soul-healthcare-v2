import { describe, expect, it } from 'vitest';
import { CHOA, validateChoaRequest } from './choaRoi';
import { roiIntroParagraphs, validateRoiInput } from './roiShared';

const choa = { location: 'Scottish Rite', dateFrom: '2026-01-01', dateTo: '2026-10-06', recordTypes: ['routine'] };
const input = { formType: 'choa', patientId: 'test-client', direction: 'to-us', duration: 'year', choa };

describe('CHOA requests', () => {
  it('uses trusted facility details and describes only the requested records and dates', () => {
    const result = validateRoiInput({ ...input, facility: { name: 'Different facility', fax: '4045559999' }, information: 'Unrelated records' });
    expect(result.errors).toEqual({});
    expect(result.value?.facility).toEqual({ name: CHOA.name, address: CHOA.address, phone: CHOA.phone, fax: CHOA.fax });
    expect(result.value?.information).toBe('Routine record set; dates of service 2026-01-01 through 2026-10-06.');
    expect(result.value?.choa).toEqual(choa);
  });
  it.each([
    { dateFrom: '2026-02-30' }, { dateTo: '' }, { dateFrom: '2027-01-01' },
    { recordTypes: [] }, { recordTypes: ['images'] }, { recordTypes: ['all', 'routine'] },
  ])('rejects incomplete, impossible, or conflicting requests: %j', (change) => {
    expect(validateChoaRequest({ ...choa, ...change }).value).toBeNull();
  });
  it('rejects unsupported form types, directions, and durations', () => {
    expect(validateRoiInput({ ...input, formType: 'unknown' }).errors.formType).toBeTruthy();
    expect(validateRoiInput({ ...input, direction: 'both' }).errors.direction).toBeTruthy();
    expect(validateRoiInput({ ...input, duration: 'transactions' }).errors.duration).toBeTruthy();
  });
  it('allows all locations but requires an explicit date range and record selection', () => {
    expect(validateChoaRequest({ ...choa, location: '', recordTypes: ['all'] }).value?.location).toBe('');
    expect(validateRoiInput({ ...input, choa: undefined }).value).toBeNull();
  });
  it('names the CHOA authorization in its introduction letter', () => {
    const letter = roiIntroParagraphs({ memberName: 'Sample Patient', facilityName: CHOA.name, program: 'gapp', direction: 'to-us', formType: 'choa' }).join(' ');
    expect(letter).toContain("Children's Healthcare of Atlanta Authorization");
    expect(letter).not.toContain('DBHDD');
  });
});
