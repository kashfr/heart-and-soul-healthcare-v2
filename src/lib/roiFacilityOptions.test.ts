import { describe, expect, it } from 'vitest';
import { roiFacilityOptions } from './roiFacilityOptions';

describe('roiFacilityOptions', () => {
  it('builds physician, day program, and coordinator options from the profile', () => {
    const opts = roiFacilityOptions(
      { list: [
        { id: 'e', name: 'Dr. Jennifer Gilligan', specialty: 'Endocrinology', practice: 'Piedmont Physicians Endocrinology Buckhead', address: '105 Collier Rd NW, Suite 5040, Atlanta, GA 30309', phone: '404-367-3210', fax: '(404) 367-3215' },
        { id: 'd', name: 'Franklin Dentistry', specialty: 'Dentistry', practice: 'Franklin Dentistry' },
      ] },
      { attends: 'yes', programName: "Treasure's Box", operator: 'Seabreeze Retreat, Inc.', address: '3893 Covington Hwy', cell: '678-778-6120', fax: '404-214-6017' },
      { name: 'Jasmine Lawrence', agency: 'Benchmark Human Services', cell: '478-443-4308' },
    );
    expect(opts.map((o) => o.group)).toEqual(['Physicians', 'Physicians', 'Day program', 'Support coordination']);
    expect(opts[0]).toMatchObject({ name: 'Piedmont Physicians Endocrinology Buckhead (Dr. Jennifer Gilligan)', fax: '(404) 367-3215', phone: '404-367-3210' });
    expect(opts[1].name).toBe('Franklin Dentistry');
    expect(opts[1].label).toContain('no fax on file');
    expect(opts[2]).toMatchObject({ name: "Seabreeze Retreat, Inc. (Treasure's Box)", phone: '678-778-6120' });
    expect(opts[3].name).toBe('Benchmark Human Services (Jasmine Lawrence)');
  });

  it('skips a day program the client does not attend and empty records', () => {
    expect(roiFacilityOptions(null, { attends: 'no' }, null)).toEqual([]);
  });
});
