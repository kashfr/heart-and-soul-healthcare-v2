/**
 * Day program on file for a client: where the client spends the day when not
 * at home, who runs it, and who to call there. Nurses need this to coordinate
 * HCP and proxy-caregiver training for day-program staff, and to know where a
 * client is (and who is checking his blood sugar) during the day.
 *
 * Origin (09/2026): the only record of Ricky Yancey's day program was a
 * July 2025 ICST form naming a provider he had already left, and the office
 * address in the new provider's email signature was not the program site.
 * One structured record per client replaces digging through PDFs and email.
 *
 * Pure module (no Firestore) so validation is unit-testable.
 */

export type DayProgramAttends = 'yes' | 'no';

export const DAY_PROGRAM_SERVICE_TYPES = [
  'Community Access - Group',
  'Community Access - Individual',
  'Adult Day Health',
  'Prevocational',
  'Supported Employment',
  'School',
  'Other',
] as const;

export interface DayProgram {
  attends?: DayProgramAttends;
  programName?: string; // the program as the client and staff know it, e.g. "Treasure's Box"
  operator?: string; // the licensed provider that runs it / bills for it, when different
  serviceType?: string;
  address?: string; // the PROGRAM SITE, not the operator's office
  schedule?: string; // e.g. "Monday through Friday"
  startedOn?: string; // YYYY-MM-DD
  contactName?: string;
  contactTitle?: string;
  phone?: string;
  cell?: string;
  email?: string;
  fax?: string;
  staff?: string; // day-program staff who support this client (training roster)
  notes?: string; // best training times, site notes, anything else
  updatedAt?: unknown;
  updatedByName?: string;
}

export const DAY_PROGRAM_TEXT_FIELDS = [
  'programName',
  'operator',
  'serviceType',
  'address',
  'schedule',
  'startedOn',
  'contactName',
  'contactTitle',
  'phone',
  'cell',
  'email',
  'fax',
  'staff',
  'notes',
] as const;

export type DayProgramErrorKey = 'attends' | 'programName' | 'address' | 'contactName' | 'contact' | 'email' | 'startedOn';

/** Display order for the escort-to-first-error behaviour. */
export const DAY_PROGRAM_ERROR_ORDER: readonly DayProgramErrorKey[] = [
  'attends',
  'programName',
  'address',
  'startedOn',
  'contactName',
  'contact',
  'email',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What must be filled before the record saves. "Does not attend" needs
 * nothing else; "attends" needs enough to actually reach the program: its
 * name, the site address, a contact person, and a phone or email for them.
 */
export function validateDayProgram(d: DayProgram): Partial<Record<DayProgramErrorKey, string>> {
  const errors: Partial<Record<DayProgramErrorKey, string>> = {};
  if (d.attends !== 'yes' && d.attends !== 'no') {
    errors.attends = 'Choose whether this client attends a day program.';
    return errors;
  }
  if (d.attends === 'no') return errors;
  const t = (v?: string) => (v || '').trim();
  if (!t(d.programName)) errors.programName = 'Enter the day program name.';
  if (!t(d.address)) errors.address = 'Enter the program site address (where the client attends, not the provider office).';
  if (t(d.startedOn) && !ISO_DATE_RE.test(t(d.startedOn))) errors.startedOn = 'Enter a valid date.';
  if (!t(d.contactName)) errors.contactName = 'Enter the primary contact at the program.';
  if (!t(d.phone) && !t(d.cell) && !t(d.email)) errors.contact = 'Enter at least one way to reach the contact (phone, cell, or email).';
  if (t(d.email) && !EMAIL_RE.test(t(d.email))) errors.email = 'Enter a valid email address.';
  return errors;
}

/**
 * The payload to write: trimmed strings for every field. When the client
 * does not attend, the program details are cleared so stale contact info
 * can never linger behind a "no".
 */
export function normalizeDayProgram(d: DayProgram): Record<string, string> {
  const out: Record<string, string> = { attends: d.attends || '' };
  for (const k of DAY_PROGRAM_TEXT_FIELDS) {
    out[k] = d.attends === 'yes' ? (d[k] || '').trim() : '';
  }
  return out;
}
