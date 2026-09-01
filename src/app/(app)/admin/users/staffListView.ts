// Client-side search + column sort for the Staff & Roles tables. Pure
// functions so the ordering rules stay unit-testable without rendering the
// page. Kept client-side (rather than changing /api/admin/users) because that
// endpoint also feeds the clients, referrals, and settings screens.

export type StaffSortKey = 'name' | 'email' | 'phone' | 'role' | 'credential' | 'status';
export type StaffSortDir = 'asc' | 'desc';

/** The subset of a staff row that search and sort read. The page's StaffRow
    satisfies this structurally. */
export interface StaffListItem {
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  credential: string | null;
  active: boolean;
  hasSignedIn: boolean;
}

/** Case-insensitive substring match across the visible columns. A digits-only
    fallback lets a query like "3478203" find "(347) 820-0388" despite the
    stored formatting. */
export function staffMatchesQuery(s: StaffListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const fields = [s.displayName, s.email, s.phone, s.role, s.credential];
  if (fields.some((v) => (v || '').toLowerCase().includes(q))) return true;
  const qDigits = q.replace(/\D/g, '');
  return qDigits.length > 0 && (s.phone || '').replace(/\D/g, '').includes(qDigits);
}

// Status ranks Active → Pending → Deactivated so an ascending sort reads
// healthiest-first. Within one table only two of the three occur (the page
// splits active from deactivated), but ranking all three keeps the
// comparator table-agnostic.
function sortValue(s: StaffListItem, key: StaffSortKey): string | number {
  switch (key) {
    case 'name':
      return (s.displayName || '').toLowerCase();
    case 'email':
      return (s.email || '').toLowerCase();
    case 'phone':
      return s.phone || '';
    case 'role':
      return s.role || '';
    case 'credential':
      return s.credential || '';
    case 'status':
      return !s.active ? 2 : s.hasSignedIn ? 0 : 1;
  }
}

export function compareStaff(
  a: StaffListItem,
  b: StaffListItem,
  key: StaffSortKey,
  dir: StaffSortDir
): number {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  // Blank cells sink to the bottom in either direction so "—" rows never
  // bury rows with real data.
  if (av === '' && bv !== '') return 1;
  if (bv === '' && av !== '') return -1;
  if (av < bv) return dir === 'asc' ? -1 : 1;
  if (av > bv) return dir === 'asc' ? 1 : -1;
  // Tiebreak by name so equal-valued rows (same role, same credential, …)
  // stay alphabetical instead of falling back to API order.
  return (a.displayName || '').toLowerCase().localeCompare((b.displayName || '').toLowerCase());
}
