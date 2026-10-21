/**
 * A referral taken over the phone: what staff jot down while the caller is on
 * the line, turned into the same referral the website forms create, so it
 * lands on the board, gets the fit and partner badges, and converts to a
 * client record with the same label/value rows (see referralConvertShared).
 * Pure module (no Firebase) so validation and the row mapping are unit-tested.
 */
import { formatDateUS } from './dateFormat';
import { formatUSPhone, formatUSPhoneExt } from './phone';
import { GA_COUNTIES } from './georgia';
import { PROGRAMS } from './programs';
import type { ServiceKey } from './diagnosisCatalog';

export const CALLER_RELATIONSHIPS = [
  'Parent',
  'Legal guardian',
  'Grandparent or other relative',
  'Foster parent',
  'Hospital case manager / discharge planner',
  'Support coordinator / case manager',
  'Physician office',
  'Self',
  'Other',
] as const;

export const HOSPITAL_STATUSES = ['In the hospital now', 'At home', 'Not sure'] as const;

export const SERVICE_NEED_OPTIONS: { value: ServiceKey | ''; label: string }[] = [
  { value: 'nursing', label: 'Skilled nursing' },
  { value: 'pss', label: 'Personal support (PSS)' },
  { value: 'behavioral', label: 'Behavioral support' },
  { value: '', label: 'Not sure yet' },
];

export interface PhoneReferralInput {
  callerName: string;
  callerRelationship: string;
  callerPhone: string;
  callerEmail: string;
  clientName: string;
  /** YYYY-MM-DD from a date input, or ''. */
  dob: string;
  /** A program id from the catalog, or '' for not sure. */
  program: string;
  county: string;
  street: string;
  city: string;
  zip: string;
  medicaidId: string;
  diagnosis: string;
  service: ServiceKey | '';
  hospitalStatus: string;
  hospitalName: string;
  /** YYYY-MM-DD, or ''. */
  expectedDischarge: string;
  physicianName: string;
  physicianPhone: string;
  callNotes: string;
  /** Staff uid to hand it to, or ''. */
  assigneeUid: string;
}

export type PhoneReferralField =
  | 'callerName'
  | 'callerPhone'
  | 'callerEmail'
  | 'clientName'
  | 'dob'
  | 'county'
  | 'zip'
  | 'expectedDischarge';

/** Display order, so the escort lands on the topmost problem. */
export const PHONE_REFERRAL_FIELD_ORDER: readonly PhoneReferralField[] = [
  'callerName',
  'callerPhone',
  'callerEmail',
  'clientName',
  'dob',
  'county',
  'zip',
  'expectedDischarge',
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyPhoneReferral(): PhoneReferralInput {
  return {
    callerName: '', callerRelationship: '', callerPhone: '', callerEmail: '',
    clientName: '', dob: '', program: '', county: '', street: '', city: '', zip: '',
    medicaidId: '', diagnosis: '', service: '', hospitalStatus: '', hospitalName: '',
    expectedDischarge: '', physicianName: '', physicianPhone: '', callNotes: '', assigneeUid: '',
  };
}

/** The local 10 digits, dropping a leading US 1; '' digits stay ''. Unlike
 *  phoneDigits this does not truncate, so a mistyped extra digit is caught. */
function localDigits(v: string): string {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/**
 * Only what the VA needs to call back is required: who called, a number to
 * reach them, and who the referral is for. Everything else is optional,
 * because a phone call rarely covers it all, but what is entered must be
 * well formed. `today` is YYYY-MM-DD (agency time) for the date checks.
 */
export function validatePhoneReferral(r: PhoneReferralInput, today: string): Partial<Record<PhoneReferralField, string>> {
  const e: Partial<Record<PhoneReferralField, string>> = {};
  if (!r.callerName.trim()) e.callerName = 'Enter the caller’s name.';
  const phone = localDigits(r.callerPhone);
  if (!phone) e.callerPhone = 'Enter a callback number.';
  else if (phone.length !== 10) e.callerPhone = 'Enter a 10-digit phone number.';
  if (r.callerEmail.trim() && !EMAIL_RE.test(r.callerEmail.trim())) e.callerEmail = 'Enter a valid email address, or leave it blank.';
  if (!r.clientName.trim()) e.clientName = 'Enter the name of the person the referral is for.';
  if (r.dob) {
    if (!ISO_DATE_RE.test(r.dob)) e.dob = 'Enter a valid date.';
    else if (r.dob > today) e.dob = 'The date of birth can’t be in the future.';
  }
  if (r.county && !GA_COUNTIES.includes(r.county)) e.county = 'Choose a county from the list.';
  if (r.zip && !/^\d{5}$/.test(r.zip.trim())) e.zip = 'Enter a 5-digit ZIP code.';
  if (r.expectedDischarge && !ISO_DATE_RE.test(r.expectedDischarge)) e.expectedDischarge = 'Enter a valid date.';
  return e;
}

/** The caller's number as stored: the portal's standard (XXX) XXX-XXXX. */
export function formatPhone(v: string): string {
  return formatUSPhone(v);
}

/** "2 years" / "8 months" at `today` (YYYY-MM-DD); '' when it can't be read. */
export function ageAt(dob: string, today: string): string {
  if (!ISO_DATE_RE.test(dob) || !ISO_DATE_RE.test(today) || dob > today) return '';
  const [by, bm, bd] = dob.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let months = (ty - by) * 12 + (tm - bm);
  if (td < bd) months -= 1;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  return years < 1 ? `${months} month${months === 1 ? '' : 's'}` : `${years} year${years === 1 ? '' : 's'}`;
}

/** The program as the website forms store it ("GAPP - Georgia Pediatric Program"). */
export function programLabel(id: string): string {
  const p = PROGRAMS.find((x) => x.id === id);
  return p ? `${p.label} - ${p.full}` : '';
}

/**
 * The detail rows, labelled like the website intake so "Create Client Record"
 * reads them (Date of birth, Address, Member's Medicaid ID, Diagnosis,
 * Child's physician, Physician phone) and the board's fit badge reads the
 * care need. Blank rows are dropped by createReferral.
 */
export function phoneReferralDetails(r: PhoneReferralInput, today: string, takenBy: string): { label: string; value: string }[] {
  const t = (v: string) => String(v || '').trim();
  const street = t(r.street);
  const city = t(r.city);
  const zip = t(r.zip);
  const address = street ? [street, city, `GA${zip ? ` ${zip}` : ''}`].filter(Boolean).join(', ') : '';
  const service = SERVICE_NEED_OPTIONS.find((o) => o.value && o.value === r.service);
  const inHospital = r.hospitalStatus === 'In the hospital now';
  return [
    { label: 'Taken by phone', value: takenBy ? `Call taken by ${takenBy}` : 'Phone call' },
    { label: 'Relationship to child', value: t(r.callerRelationship) },
    { label: 'Date of birth', value: r.dob ? formatDateUS(r.dob) : '' },
    { label: 'Age', value: r.dob ? ageAt(r.dob, today) : '' },
    { label: 'Address', value: address },
    { label: 'City', value: street ? '' : city },
    { label: 'ZIP code', value: street ? '' : zip },
    { label: "Member's Medicaid ID", value: t(r.medicaidId) || 'Not given yet (caller will provide)' },
    { label: 'Diagnosis', value: t(r.diagnosis) },
    { label: 'Primary care need', value: service ? service.label : '' },
    { label: 'Hospital status', value: t(r.hospitalStatus) },
    { label: 'Hospital', value: inHospital ? t(r.hospitalName) : '' },
    { label: 'Expected discharge', value: inHospital && r.expectedDischarge ? formatDateUS(r.expectedDischarge) : '' },
    { label: "Child's physician", value: t(r.physicianName) },
    { label: 'Physician phone', value: t(r.physicianPhone) ? formatUSPhoneExt(r.physicianPhone) : '' },
    { label: 'Call notes', value: t(r.callNotes) },
  ];
}

/** What is kept on the referral so the form can be reopened for editing. */
export type PhoneIntake = Omit<PhoneReferralInput, 'assigneeUid'>;

export const PHONE_INTAKE_LABELS: Record<keyof PhoneIntake, string> = {
  callerName: 'caller’s name',
  callerRelationship: 'relationship',
  callerPhone: 'callback number',
  callerEmail: 'email',
  clientName: 'client’s name',
  dob: 'date of birth',
  program: 'program',
  county: 'county',
  street: 'street address',
  city: 'city',
  zip: 'ZIP code',
  medicaidId: 'Medicaid ID',
  diagnosis: 'diagnosis',
  service: 'service needed',
  hospitalStatus: 'where the client is now',
  hospitalName: 'hospital',
  expectedDischarge: 'expected discharge',
  physicianName: 'physician',
  physicianPhone: 'physician phone',
  callNotes: 'call notes',
};

export function toPhoneIntake(r: PhoneReferralInput): PhoneIntake {
  const out = {} as Record<string, string>;
  for (const k of Object.keys(PHONE_INTAKE_LABELS)) out[k] = String((r as unknown as Record<string, string>)[k] ?? '').trim();
  return out as unknown as PhoneIntake;
}

/** The form's fields from a stored intake (missing keys come back blank). */
export function phoneReferralFromIntake(intake: Partial<PhoneIntake> | null | undefined): PhoneReferralInput {
  return { ...emptyPhoneReferral(), ...(intake || {}), assigneeUid: '' } as PhoneReferralInput;
}

/** Which fields an edit changed, in form order, for the timeline. */
export function changedPhoneIntakeFields(before: Partial<PhoneIntake> | null | undefined, after: PhoneIntake): string[] {
  const b = (before || {}) as Record<string, string>;
  const a = after as unknown as Record<string, string>;
  return (Object.keys(PHONE_INTAKE_LABELS) as (keyof PhoneIntake)[])
    .filter((k) => String(b[k] ?? '').trim() !== String(a[k] ?? '').trim())
    .map((k) => PHONE_INTAKE_LABELS[k]);
}

/** The form fields from a JSON body: strings only, clipped, service checked. */
export function phoneReferralFromBody(body: Record<string, unknown>): PhoneReferralInput {
  const input = emptyPhoneReferral();
  const rec = input as unknown as Record<string, string>;
  for (const k of Object.keys(input)) {
    if (typeof body[k] === 'string') rec[k] = String(body[k]).slice(0, 5000);
  }
  if (!['', 'nursing', 'pss', 'behavioral'].includes(input.service)) input.service = '';
  return input;
}
