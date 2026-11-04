/**
 * Editing a referral that came from one of the websites. Only the answers the
 * GAPP screening never reads are editable here (contact details, Medicaid ID,
 * address, physician, insurance, notes), so a correction can never turn a
 * card into one the website would have refused. Paid caregiver, agency staff,
 * date of birth, relationship, diagnosis, and the checklists stay locked: they
 * decide the screening, and changing them has to go through it.
 * Pure module (no Firebase) so the rules are unit-tested.
 */
import { formatUSPhone, formatUSPhoneExt, phoneDigits } from './phone';
import { GA_COUNTIES } from './georgia';

export type EditableSource = 'gapp-website' | 'hs-website';
export type EditKind = 'text' | 'textarea' | 'phone' | 'phoneExt' | 'email' | 'county';
export type TopField = 'clientName' | 'referrerName' | 'clientPhone' | 'clientEmail' | 'county';

export interface EditFieldSpec {
  /** 'top:clientName' for a referral field, 'row:<label>' for a detail row. */
  key: string;
  label: string;
  kind: EditKind;
  top?: TopField;
  row?: string;
  required?: boolean;
}

const top = (field: TopField, label: string, kind: EditKind, required = false): EditFieldSpec => ({
  key: `top:${field}`, label, kind, top: field, required,
});
const row = (rowLabel: string, kind: EditKind, label = rowLabel): EditFieldSpec => ({
  key: `row:${rowLabel}`, label, kind, row: rowLabel,
});

// Physician rows are the labels Create Client Record and PPOT requests read
// (referralConvertShared, ppotShared), so adding them on a GAPP card helps both.
const PHYSICIAN = [row("Child's physician", 'text', 'Physician'), row('Physician office', 'text'), row('Physician phone', 'phoneExt'), row('Physician fax', 'phone')];

const FIELDS: Record<EditableSource, EditFieldSpec[]> = {
  // GAPP site: the contact on the card is the person who filled in the form.
  'gapp-website': [
    top('clientName', "Child's name", 'text', true),
    top('referrerName', 'Submitted by', 'text'),
    top('clientPhone', 'Phone', 'phone', true),
    top('clientEmail', 'Email', 'email'),
    top('county', 'County', 'county'),
    row('Address', 'text'),
    row("Member's Medicaid ID", 'text', 'Medicaid ID'),
    ...PHYSICIAN,
    row('Comments', 'textarea'),
  ],
  'hs-website': [
    top('clientName', "Client's name", 'text', true),
    top('clientPhone', 'Client phone', 'phone', true),
    row('Secondary phone', 'phone'),
    top('clientEmail', 'Client email', 'email'),
    top('county', 'County', 'county'),
    row('Address', 'text'),
    row('Medicaid #', 'text', 'Medicaid ID'),
    row('Insurance provider', 'text'),
    row('Insurance policy #', 'text'),
    ...PHYSICIAN,
    top('referrerName', 'Referred by', 'text'),
    row('Referrer phone', 'phone'),
    row('Referrer email', 'email'),
    row('Referrer organization', 'text'),
    // Not 'Service needs' or 'Additional notes': the form screens that text
    // for an autism / behavioral picture (actions.ts processReferralSubmission).
  ],
};

/** The labels the screening reads; listed for the form's explanation. */
export const LOCKED_ANSWERS = 'paid caregiver, agency staff in the home, date of birth, relationship, diagnosis, equipment, behavior, current services, and (on the Heart & Soul form) service needs and additional notes';

export function isEditableSource(source: string): source is EditableSource {
  return source === 'gapp-website' || source === 'hs-website';
}

export function editFieldsFor(source: EditableSource): EditFieldSpec[] {
  return FIELDS[source];
}

export interface EditableReferral {
  clientName: string;
  referrerName?: string;
  clientPhone: string;
  clientEmail: string;
  county?: string;
  details: { label: string; value: string }[];
}

export function currentEditValues(r: EditableReferral, specs: EditFieldSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of specs) {
    out[s.key] = s.top
      ? String(r[s.top] ?? '')
      : String(r.details.find((d) => d.label === s.row)?.value ?? '');
  }
  return out;
}

/** As-you-type formatting, the platform standard for phone numbers. */
export function formatEditValue(kind: EditKind, value: string): string {
  if (kind === 'phone') return formatUSPhone(value);
  if (kind === 'phoneExt') return formatUSPhoneExt(value);
  return value;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Errors by field key. Only fields being changed are checked against the
 * format rules, so an old value the website let through (a 7-digit number)
 * never blocks fixing something else; required fields can't be emptied.
 */
export function validateEdits(
  specs: EditFieldSpec[],
  values: Record<string, string>,
  before: Record<string, string> = {},
): Record<string, string> {
  const e: Record<string, string> = {};
  for (const s of specs) {
    const v = String(values[s.key] ?? '').trim();
    if (!v) {
      if (s.required) e[s.key] = s.kind === 'phone' ? 'Enter a phone number.' : `Enter the ${s.label.toLowerCase()}.`;
      continue;
    }
    if (v === String(before[s.key] ?? '').trim()) continue;
    if ((s.kind === 'phone' || s.kind === 'phoneExt') && phoneDigits(v).length !== 10) e[s.key] = 'Enter a 10-digit phone number.';
    if (s.kind === 'email' && !EMAIL_RE.test(v)) e[s.key] = 'Enter a valid email address, or leave it blank.';
    if (s.kind === 'county' && !GA_COUNTIES.includes(v)) e[s.key] = 'Choose a county from the list.';
  }
  return e;
}

export interface EditChange {
  label: string;
  from: string;
  to: string;
}

const MAX_VALUE = 5000;

/**
 * The referral after the edit. Only listed fields can change; a detail row
 * that was blank is added at the end, one cleared is removed, and every other
 * row (the family's other answers, the ⚠ flags) is kept exactly as it was.
 */
export function applyEdits(
  r: EditableReferral,
  specs: EditFieldSpec[],
  values: Record<string, string>,
): { top: Partial<Record<TopField, string>>; details: { label: string; value: string }[]; changes: EditChange[] } {
  const before = currentEditValues(r, specs);
  const topOut: Partial<Record<TopField, string>> = {};
  let details = r.details.map((d) => ({ ...d }));
  const changes: EditChange[] = [];
  for (const s of specs) {
    if (!(s.key in values)) continue;
    const to = formatEditValue(s.kind, String(values[s.key] ?? '').trim()).slice(0, MAX_VALUE);
    const from = before[s.key].trim();
    if (to === from || to === formatEditValue(s.kind, from)) continue;
    changes.push({ label: s.label, from, to });
    if (s.top) {
      topOut[s.top] = to;
    } else if (s.row) {
      const i = details.findIndex((d) => d.label === s.row);
      if (!to) details = details.filter((d) => d.label !== s.row);
      else if (i >= 0) details[i] = { label: s.row, value: to };
      else details.push({ label: s.row, value: to });
    }
  }
  return { top: topOut, details, changes };
}

/** The timeline entry: old and new, because the old value was the family's. */
export function describeEdits(changes: EditChange[]): string {
  const q = (v: string) => (v ? `"${v.length > 120 ? `${v.slice(0, 117)}…` : v}"` : '(blank)');
  return `Details edited: ${changes.map((c) => `${c.label} ${q(c.from)} → ${q(c.to)}`).join('; ')}.`;
}

/**
 * A date of birth on an old referral. Referrals from before the websites
 * saved their answers (intakeAnswers) can't have screened answers edited,
 * but many from before June 2026 never asked for a date of birth at all, and
 * staff need it to answer a facility's call before the referral becomes a
 * client. So a MISSING date of birth can be filled in once on those cards;
 * one already on the card stays locked (changing it would change what the
 * screening saw). Referrals that kept their answers add or change it under
 * Screened Answers instead, where the website's checks re-run.
 */
export const DOB_ROW = 'Date of birth';

export function canAddLegacyDob(r: { details: { label: string; value: string }[]; intakeAnswers?: unknown }): boolean {
  if (r.intakeAnswers) return false;
  return !String(r.details.find((d) => d.label === DOB_ROW)?.value ?? '').trim();
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `today` is YYYY-MM-DD in agency time. Empty means "not adding one". */
export function validateLegacyDob(dob: string, today: string): string | null {
  const v = dob.trim();
  if (!v) return null;
  if (!ISO_DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) return 'Enter a valid date.';
  if (v > today) return 'The date of birth can’t be in the future.';
  if (v < '1900-01-01') return 'Enter a valid date.';
  return null;
}

/** Whole years between two YYYY-MM-DD dates. */
function yearsBetween(dob: string, today: string): number {
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export const LEGACY_DOB_FLAG_LABEL = '⚠ Young child';

/**
 * The card's rows with the date of birth added (and Age, on GAPP cards, as
 * the website prints it). When the card says the family wants a paid
 * caregiver and the child is under 6, the website's young-child check never
 * ran on this referral, so the card says so instead of passing silently.
 */
export function addLegacyDob(
  source: EditableSource,
  details: { label: string; value: string }[],
  dob: string,
  today: string,
  formatUS: (iso: string) => string,
  ageText: (iso: string) => string,
): { label: string; value: string }[] {
  const out = details.filter((d) => d.label !== DOB_ROW && !(source === 'gapp-website' && d.label === 'Age'));
  out.push({ label: DOB_ROW, value: formatUS(dob) });
  if (source === 'gapp-website') {
    const age = ageText(dob);
    if (age) out.push({ label: 'Age', value: age });
  }
  const paid = /^yes/i.test(String(details.find((d) => d.label === 'Seeking paid caregiver')?.value ?? '').trim());
  if (paid && yearsBetween(dob, today) < 6 && !out.some((d) => d.label === LEGACY_DOB_FLAG_LABEL)) {
    out.unshift({
      label: LEGACY_DOB_FLAG_LABEL,
      value: 'Date of birth added after intake: the family is asking for a paid caregiver for a child under 6, and this referral came in before the website’s young-child check. Confirm the child has a skilled nursing or mobility need before going further.',
    });
  }
  return out;
}
