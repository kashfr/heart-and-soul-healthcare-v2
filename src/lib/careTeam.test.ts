import { describe, it, expect } from 'vitest';
import { resolveCareTeamMembers, type CareTeamStaff } from './careTeam';

function staff(over: Partial<CareTeamStaff> & { uid: string }): CareTeamStaff {
  return {
    displayName: over.uid.toUpperCase(),
    email: `${over.uid}@x.com`,
    role: 'nurse',
    credential: 'RN',
    active: true,
    ...over,
  };
}

const ACTIVE = staff({ uid: 'nurse-a' });
const INACTIVE = staff({ uid: 'nurse-b', active: false });
const ADMIN = staff({ uid: 'admin-c', role: 'admin', credential: null });
const ROSTER = [ACTIVE, INACTIVE, ADMIN];

describe('resolveCareTeamMembers', () => {
  it('resolves active assigned staff in assignment order', () => {
    const out = resolveCareTeamMembers(['admin-c', 'nurse-a'], ROSTER);
    expect(out.map((m) => m.uid)).toEqual(['admin-c', 'nurse-a']);
  });

  it('keeps a chip for staff deactivated after being assigned', () => {
    const out = resolveCareTeamMembers(['nurse-a', 'nurse-b'], ROSTER);
    expect(out.map((m) => m.uid)).toEqual(['nurse-a', 'nurse-b']);
    expect(out[1].active).toBe(false);
    expect(out[1].displayName).toBe('NURSE-B');
  });

  it('synthesizes a removable inactive stub for a uid with no profile doc', () => {
    const out = resolveCareTeamMembers(['ghost-uid'], ROSTER);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      uid: 'ghost-uid',
      displayName: 'Removed account',
      active: false,
      credential: null,
    });
  });

  it('returns nothing while the staff list is still loading', () => {
    // Empty staffList means the fetch hasn't resolved — rendering stubs then
    // would flash every real member as "Removed account".
    expect(resolveCareTeamMembers(['nurse-a'], [])).toEqual([]);
  });

  it('returns an empty list for an empty team', () => {
    expect(resolveCareTeamMembers([], ROSTER)).toEqual([]);
  });
});
