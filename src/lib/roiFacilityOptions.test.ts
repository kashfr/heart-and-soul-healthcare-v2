import { describe, expect, it } from 'vitest';
import { roiFacilityOptions } from './roiFacilityOptions';

describe('roiFacilityOptions', () => {
  it('builds physician, day program, and coordinator options from the profile', () => {
    const opts = roiFacilityOptions(
      { list: [
        { id: 'e', name: 'Dr. Jamie Sample', specialty: 'Endocrinology', practice: 'Example Endocrinology Midtown', address: '100 Example Way, Suite 100, Atlanta, GA 30309', phone: '404-555-0110', fax: '(404) 555-0115' },
        { id: 'd', name: 'Franklin Dentistry', specialty: 'Dentistry', practice: 'Franklin Dentistry' },
      ] },
      { attends: 'yes', programName: "Treasure's Box", operator: 'Seabreeze Retreat, Inc.', address: '3893 Covington Hwy', cell: '678-555-0161', fax: '404-555-0117' },
      { name: 'Jasmine Lawrence', agency: 'Benchmark Human Services', cell: '478-443-4308' },
    );
    expect(opts.map((o) => o.group)).toEqual(['Physicians', 'Physicians', 'Day program', 'Support coordination']);
    expect(opts[0]).toMatchObject({ name: 'Example Endocrinology Midtown (Dr. Jamie Sample)', fax: '(404) 555-0115', phone: '404-555-0110' });
    expect(opts[1].name).toBe('Franklin Dentistry');
    expect(opts[1].label).toContain('no fax on file');
    expect(opts[2]).toMatchObject({ name: "Seabreeze Retreat, Inc. (Treasure's Box)", phone: '678-555-0161' });
    expect(opts[3].name).toBe('Benchmark Human Services (Jasmine Lawrence)');
  });

  it('skips a day program the client does not attend and empty records', () => {
    expect(roiFacilityOptions(null, { attends: 'no' }, null)).toEqual([]);
  });
});
