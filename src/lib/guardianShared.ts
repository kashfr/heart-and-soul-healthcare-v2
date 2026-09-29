/**
 * Who makes legal decisions for a client, and the other people we answer
 * to about their care: legal guardian, parent of a minor, health care agent,
 * representative payee, conservator, responsible party.
 *
 * Origin (09/2026): Ricky Yancey's guardian (the State, through a DHS
 * representative) was only findable inside his ISP PDF, and a release of
 * information needed the guardian's signature within days.
 *
 * Pure module (no Firestore) so validation is unit-testable.
 */

export type DecisionMaker = 'self' | 'guardian' | 'parent';

export const DECISION_MAKER_LABELS: Record<DecisionMaker, string> = {
  self: 'Makes their own decisions (no guardian)',
  guardian: 'Has a legal guardian',
  parent: 'Minor: parent or guardian decides',
};

export const GUARDIAN_ROLES = [
  'Legal guardian',
  'Parent',
  'Health care agent (POA)',
  'Representative payee',
  'Conservator',
  'Responsible party',
  'Other',
] as const;

export interface GuardianContact {
  id: string;
  role: string;
  name: string;
  relationship?: string; // "Mother", "State (DHS representative)", agency
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface GuardianRecord {
  decisionMaker?: DecisionMaker;
  contacts: GuardianContact[];
  updatedAt?: unknown;
  updatedByName?: string;
}

export type ContactErrorKey = 'role' | 'name' | 'reach';
export interface GuardianErrors {
  decisionMaker?: string;
  contacts?: string; // list-level: the required decision maker is missing
  rows: Record<string, Partial<Record<ContactErrorKey, string>>>;
}

/** The contact role a decision-maker answer requires on the list, if any. */
export function requiredRole(dm?: DecisionMaker): string | null {
  if (dm === 'guardian') return 'Legal guardian';
  if (dm === 'parent') return 'Parent';
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateGuardian(rec: GuardianRecord): GuardianErrors {
  const errors: GuardianErrors = { rows: {} };
  if (!rec.decisionMaker) errors.decisionMaker = 'Choose who makes legal decisions for this client.';
  const need = requiredRole(rec.decisionMaker);
  if (need && !rec.contacts.some((c) => c.role === need || (need === 'Parent' && c.role === 'Legal guardian'))) {
    errors.contacts = need === 'Parent'
      ? 'Add the parent or legal guardian who decides for this minor.'
      : 'Add the legal guardian below.';
  }
  for (const c of rec.contacts) {
    const e: Partial<Record<ContactErrorKey, string>> = {};
    if (!(c.role || '').trim()) e.role = 'Choose a role.';
    if (!(c.name || '').trim()) e.name = 'Enter a name.';
    const email = (c.email || '').trim();
    if (!(c.phone || '').trim() && !email) e.reach = 'Enter a phone number or email.';
    else if (email && !EMAIL_RE.test(email)) e.reach = 'Enter a valid email address.';
    if (Object.keys(e).length) errors.rows[c.id] = e;
  }
  return errors;
}

export function hasGuardianErrors(e: GuardianErrors): boolean {
  return !!(e.decisionMaker || e.contacts || Object.keys(e.rows).length);
}

const ROLE_ORDER = (r: string) => {
  const i = (GUARDIAN_ROLES as readonly string[]).indexOf(r);
  return i < 0 ? GUARDIAN_ROLES.length : i;
};

/** Trimmed contacts, decision makers first. */
export function normalizeGuardian(rec: GuardianRecord): { decisionMaker: DecisionMaker | ''; contacts: GuardianContact[] } {
  const t = (v?: string) => (v || '').trim();
  const contacts = rec.contacts
    .map((c) => ({ id: c.id, role: t(c.role), name: t(c.name), relationship: t(c.relationship), phone: t(c.phone), email: t(c.email), address: t(c.address), notes: t(c.notes) }))
    .sort((a, b) => ROLE_ORDER(a.role) - ROLE_ORDER(b.role));
  return { decisionMaker: rec.decisionMaker || '', contacts };
}
