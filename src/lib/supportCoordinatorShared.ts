/**
 * The client's support coordinator (NOW/COMP support coordination or
 * intensive support coordination) or case manager: the person who writes
 * the ISP, submits authorization changes, and schedules the annual meeting.
 *
 * Origin (09/2026): the only way to find a client's coordinator was the ISP
 * participants table or an old email thread.
 *
 * Pure module (no Firestore) so validation is unit-testable.
 */

export const COORDINATOR_TITLES = [
  'Support Coordinator',
  'Intensive Support Coordinator',
  'Case Manager',
  'Other',
] as const;

export interface SupportCoordinator {
  name?: string;
  title?: string;
  agency?: string;
  phone?: string;
  cell?: string;
  email?: string;
  fax?: string;
  address?: string;
  supervisor?: string; // name and how to reach them, when the coordinator is out
  notes?: string;
  updatedAt?: unknown;
  updatedByName?: string;
}

export const COORDINATOR_TEXT_FIELDS = ['name', 'title', 'agency', 'phone', 'cell', 'email', 'fax', 'address', 'supervisor', 'notes'] as const;

export type CoordinatorErrorKey = 'name' | 'agency' | 'contact' | 'email';
export const COORDINATOR_ERROR_ORDER: readonly CoordinatorErrorKey[] = ['name', 'agency', 'contact', 'email'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateCoordinator(c: SupportCoordinator): Partial<Record<CoordinatorErrorKey, string>> {
  const t = (v?: string) => (v || '').trim();
  const e: Partial<Record<CoordinatorErrorKey, string>> = {};
  if (!t(c.name)) e.name = "Enter the coordinator's name.";
  if (!t(c.agency)) e.agency = 'Enter the support coordination agency.';
  if (!t(c.phone) && !t(c.cell) && !t(c.email)) e.contact = 'Enter at least one way to reach them (phone, cell, or email).';
  if (t(c.email) && !EMAIL_RE.test(t(c.email))) e.email = 'Enter a valid email address.';
  return e;
}

export function normalizeCoordinator(c: SupportCoordinator): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of COORDINATOR_TEXT_FIELDS) out[k] = (c[k] || '').trim();
  return out;
}
