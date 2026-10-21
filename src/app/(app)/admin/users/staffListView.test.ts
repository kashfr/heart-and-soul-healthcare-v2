import { describe, it, expect } from 'vitest';
import {
  staffMatchesQuery,
  compareStaff,
  type StaffListItem,
  type StaffSortKey,
} from './staffListView';

function row(overrides: Partial<StaffListItem> = {}): StaffListItem {
  return {
    displayName: 'Roneika Leslie',
    email: 'roneikaleslie17@gmail.com',
    phone: '(347) 820-0388',
    role: 'nurse',
    credential: 'RN',
    active: true,
    hasSignedIn: true,
    ...overrides,
  };
}

function sorted(rows: StaffListItem[], key: StaffSortKey, dir: 'asc' | 'desc' = 'asc') {
  return [...rows].sort((a, b) => compareStaff(a, b, key, dir)).map((r) => r.displayName);
}

describe('staffMatchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    expect(staffMatchesQuery(row(), '')).toBe(true);
    expect(staffMatchesQuery(row(), '   ')).toBe(true);
  });

  it('matches name case-insensitively on a partial string', () => {
    expect(staffMatchesQuery(row(), 'roneika')).toBe(true);
    expect(staffMatchesQuery(row(), 'LESLIE')).toBe(true);
    expect(staffMatchesQuery(row(), 'nobody')).toBe(false);
  });

  it('matches email, role, and credential', () => {
    expect(staffMatchesQuery(row(), 'roneikaleslie17@')).toBe(true);
    expect(staffMatchesQuery(row(), 'nurse')).toBe(true);
    expect(staffMatchesQuery(row(), 'rn')).toBe(true);
  });

  it('matches phone by raw digits despite the stored (XXX) XXX-XXXX formatting', () => {
    expect(staffMatchesQuery(row(), '3478200388')).toBe(true);
    expect(staffMatchesQuery(row(), '347-820')).toBe(true);
    expect(staffMatchesQuery(row(), '(347)')).toBe(true);
    expect(staffMatchesQuery(row(), '9999999')).toBe(false);
  });

  it('does not throw on rows with null fields', () => {
    const bare = row({ displayName: null, email: null, phone: null, role: null, credential: null });
    expect(staffMatchesQuery(bare, 'anything')).toBe(false);
    expect(staffMatchesQuery(bare, '')).toBe(true);
  });
});

describe('compareStaff', () => {
  const alice = row({ displayName: 'alice Adams' });
  const bianca = row({ displayName: 'Bianca Bryant' });
  const zoe = row({ displayName: 'Zoe Young' });

  it('sorts by name ascending, case-insensitively', () => {
    expect(sorted([zoe, alice, bianca], 'name')).toEqual([
      'alice Adams',
      'Bianca Bryant',
      'Zoe Young',
    ]);
  });

  it('reverses on descending', () => {
    expect(sorted([alice, zoe, bianca], 'name', 'desc')).toEqual([
      'Zoe Young',
      'Bianca Bryant',
      'alice Adams',
    ]);
  });

  it('sinks blank cells to the bottom in both directions', () => {
    const noPhone = row({ displayName: 'No Phone', phone: null });
    const withPhone = row({ displayName: 'With Phone', phone: '(111) 222-3333' });
    expect(sorted([noPhone, withPhone], 'phone', 'asc')).toEqual(['With Phone', 'No Phone']);
    expect(sorted([noPhone, withPhone], 'phone', 'desc')).toEqual(['With Phone', 'No Phone']);
  });

  it('ranks status Active → Pending → Deactivated ascending', () => {
    const activeRow = row({ displayName: 'Signed In', active: true, hasSignedIn: true });
    const pending = row({ displayName: 'Pending', active: true, hasSignedIn: false });
    const deactivated = row({ displayName: 'Gone', active: false, hasSignedIn: true });
    expect(sorted([deactivated, pending, activeRow], 'status')).toEqual([
      'Signed In',
      'Pending',
      'Gone',
    ]);
  });

  it('breaks ties alphabetically by name instead of keeping input order', () => {
    const rnZoe = row({ displayName: 'Zoe Young', credential: 'RN' });
    const rnAlice = row({ displayName: 'Alice Adams', credential: 'RN' });
    const lpn = row({ displayName: 'Mid Lpn', credential: 'LPN' });
    expect(sorted([rnZoe, lpn, rnAlice], 'credential')).toEqual([
      'Mid Lpn',
      'Alice Adams',
      'Zoe Young',
    ]);
  });
});
