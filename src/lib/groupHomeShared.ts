/**
 * Group home on file for a client: the residential provider the client lives
 * with, the home's address, and the house manager to call. Nurses need this to
 * schedule RN oversight and supervisory visits at the home and to know who
 * answers for the client's care there.
 *
 * Origin (11/2026): the only record of who to call to schedule a
 * client's oversight visits was an email from the group home's manager
 * forwarded by the support coordinator, and the client page had nowhere to
 * keep a residential provider. Modeled on the Day Program record.
 *
 * Pure module (no Firestore) so validation is unit-testable.
 */

export type GroupHomeLivesIn = 'yes' | 'no';

export interface GroupHome {
  livesIn?: GroupHomeLivesIn;
  provider?: string; // the residential provider, e.g. "Maple Grove Residential, Inc."
  homeName?: string; // what staff call the home, when it has a name
  address?: string; // the HOME, not the provider's office
  contactName?: string; // house manager or whoever schedules visits
  contactTitle?: string;
  phone?: string;
  cell?: string;
  email?: string;
  fax?: string;
  staff?: string; // home staff who support this client (training roster)
  notes?: string; // how to schedule visits, gate codes, anything else
  updatedAt?: unknown;
  updatedByName?: string;
}

export const GROUP_HOME_TEXT_FIELDS = [
  'provider',
  'homeName',
  'address',
  'contactName',
  'contactTitle',
  'phone',
  'cell',
  'email',
  'fax',
  'staff',
  'notes',
] as const;

export type GroupHomeErrorKey = 'livesIn' | 'provider' | 'address' | 'contactName' | 'contact' | 'email';

/** Display order for the escort-to-first-error behaviour. */
export const GROUP_HOME_ERROR_ORDER: readonly GroupHomeErrorKey[] = [
  'livesIn',
  'provider',
  'address',
  'contactName',
  'contact',
  'email',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * What must be filled before the record saves. "Does not live in a group
 * home" needs nothing else; "lives in one" needs enough to reach the home:
 * the provider, the home address, a contact person, and a phone or email.
 */
export function validateGroupHome(d: GroupHome): Partial<Record<GroupHomeErrorKey, string>> {
  const errors: Partial<Record<GroupHomeErrorKey, string>> = {};
  if (d.livesIn !== 'yes' && d.livesIn !== 'no') {
    errors.livesIn = 'Choose whether this client lives in a group home.';
    return errors;
  }
  if (d.livesIn === 'no') return errors;
  const t = (v?: string) => (v || '').trim();
  if (!t(d.provider)) errors.provider = 'Enter the residential provider.';
  if (!t(d.address)) errors.address = 'Enter the group home address (where the client lives, not the provider office).';
  if (!t(d.contactName)) errors.contactName = 'Enter the contact at the home, usually the house manager.';
  if (!t(d.phone) && !t(d.cell) && !t(d.email)) errors.contact = 'Enter at least one way to reach the contact (phone, cell, or email).';
  if (t(d.email) && !EMAIL_RE.test(t(d.email))) errors.email = 'Enter a valid email address.';
  return errors;
}

/**
 * The payload to write: trimmed strings for every field. When the client
 * does not live in a group home, the details are cleared so stale contact
 * info can never linger behind a "no".
 */
export function normalizeGroupHome(d: GroupHome): Record<string, string> {
  const out: Record<string, string> = { livesIn: d.livesIn || '' };
  for (const k of GROUP_HOME_TEXT_FIELDS) {
    out[k] = d.livesIn === 'yes' ? (d[k] || '').trim() : '';
  }
  return out;
}
