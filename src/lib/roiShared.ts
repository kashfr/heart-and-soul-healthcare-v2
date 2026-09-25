/**
 * Release of Information (DBHDD Policy 23-110 Attachment A, the IDD version
 * of 6/22/2023 from IDD Connects > Document Templates): types, defaults,
 * validation, and the introduction letter's wording. Shared by the Fax
 * Center, the /api/fax/roi routes, the PDF builders, and vitest. No Firebase
 * imports.
 *
 * The form moves records ONE way: "From" the agency that holds them "To" the
 * one asking. A facility that wants to share with us is From; we are To. When
 * records should flow both ways the guardian signs two copies, one each way.
 *
 * Unlike the GAPP Appendix T, the agency may prepare this form: it is the
 * member's (or guardian's) authorization, and they review, initial, and sign
 * it. The portal fills in who, what, why, and for how long; the signer does
 * the rest.
 */
import { normalizeUSFaxNumber } from './verbalOrderShared';
import { getProgram } from './programs';

/** Heart and Soul as a party on the form and the letterhead. */
export const AGENCY = {
  name: 'Heart and Soul Healthcare',
  street: '1372 Peachtree St NE',
  cityStateZip: 'Atlanta, GA 30309',
  phone: '6786440337',
} as const;

export interface RoiParty {
  name: string;
  address: string;
  /** 10 digits or ''. */
  phone: string;
  /** 10 digits or ''. */
  fax: string;
}

/** 'to-us': the facility releases to Heart and Soul. 'from-us': we release to
 *  the facility. 'both': two copies, one each way, in one PDF. */
export type RoiDirection = 'to-us' | 'from-us' | 'both';
/** The two boxes on the form: one (1) year, or the period needed to finish
 *  everything related to the member's services. */
export type RoiDuration = 'year' | 'transactions';

export const ROI_DIRECTION_LABEL: Record<RoiDirection, string> = {
  'to-us': 'The facility shares with us',
  'from-us': 'We share with the facility',
  both: 'Both ways (two copies)',
};

export const ROI_TEXT_MAX = { name: 90, address: 120, information: 360, purpose: 300 } as const;

export interface RoiInput {
  patientId: string;
  direction: RoiDirection;
  facility: RoiParty;
  information: string;
  purpose: string;
  duration: RoiDuration;
}

export type RoiField = 'patientId' | 'direction' | 'facilityName' | 'facilityAddress' | 'facilityPhone' | 'facilityFax' | 'information' | 'purpose' | 'duration';
export type RoiErrors = Partial<Record<RoiField, string>>;

export const DEFAULT_ROI_INFORMATION =
  'Medical and nursing records, diagnoses, medication lists, physician orders, care plans, progress notes, and discharge or transfer information needed to coordinate care.';

export function defaultRoiPurpose(program: string | undefined): string {
  const p = getProgram(program)?.label;
  return p
    ? `Coordination of care and services under the ${p} program.`
    : 'Coordination of care and services.';
}

function phoneDigits(raw: string): string {
  return normalizeUSFaxNumber(String(raw || ''));
}

/** Validate and tidy a Release of Information request from the browser. */
export function validateRoiInput(raw: Record<string, unknown>): { errors: RoiErrors; value: RoiInput | null } {
  const e: RoiErrors = {};
  const patientId = String(raw.patientId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(patientId)) e.patientId = 'Choose the client.';
  const direction = raw.direction;
  if (direction !== 'to-us' && direction !== 'from-us' && direction !== 'both') e.direction = 'Choose which way the records go.';
  const f = (raw.facility && typeof raw.facility === 'object' ? raw.facility : {}) as Partial<Record<keyof RoiParty, unknown>>;
  const name = String(f.name || '').trim();
  if (!name) e.facilityName = 'Enter the facility or agency name.';
  else if (name.length > ROI_TEXT_MAX.name) e.facilityName = `Keep the name under ${ROI_TEXT_MAX.name} characters.`;
  const address = String(f.address || '').trim();
  if (address.length > ROI_TEXT_MAX.address) e.facilityAddress = `Keep the address under ${ROI_TEXT_MAX.address} characters.`;
  const phoneRaw = String(f.phone || '').trim();
  const phone = phoneDigits(phoneRaw);
  if (phoneRaw && !phone) e.facilityPhone = 'Enter a 10-digit phone number, or leave it blank.';
  const faxRaw = String(f.fax || '').trim();
  const fax = phoneDigits(faxRaw);
  if (faxRaw && !fax) e.facilityFax = 'Enter a 10-digit fax number, or leave it blank.';
  const information = String(raw.information || '').trim();
  if (!information) e.information = 'Say what information may be shared.';
  else if (information.length > ROI_TEXT_MAX.information) e.information = `Keep this under ${ROI_TEXT_MAX.information} characters so it fits on the form.`;
  const purpose = String(raw.purpose || '').trim();
  if (!purpose) e.purpose = 'Say why the information is being shared.';
  else if (purpose.length > ROI_TEXT_MAX.purpose) e.purpose = `Keep this under ${ROI_TEXT_MAX.purpose} characters so it fits on the form.`;
  const duration = raw.duration;
  if (duration !== 'year' && duration !== 'transactions') e.duration = 'Choose how long the authorization lasts.';
  if (Object.keys(e).length > 0) return { errors: e, value: null };
  return {
    errors: e,
    value: { patientId, direction: direction as RoiDirection, facility: { name, address, phone, fax }, information, purpose, duration: duration as RoiDuration },
  };
}

/** The From/To pairs to print: one per copy the guardian signs. */
export function roiCopies(direction: RoiDirection, facility: RoiParty, agencyFax: string): Array<{ from: RoiParty; to: RoiParty }> {
  const us: RoiParty = { name: AGENCY.name, address: `${AGENCY.street}, ${AGENCY.cityStateZip}`, phone: AGENCY.phone, fax: agencyFax };
  const toUs = { from: facility, to: us };
  const fromUs = { from: us, to: facility };
  if (direction === 'to-us') return [toUs];
  if (direction === 'from-us') return [fromUs];
  return [toUs, fromUs];
}

/** "(678) 644-0337 / Fax (470) 235-1891" for the form's Phone/Fax blank. */
export function roiPhoneFaxLine(p: Pick<RoiParty, 'phone' | 'fax'>): string {
  const fmt = (d: string) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : '');
  const phone = fmt(p.phone);
  const fax = fmt(p.fax);
  if (phone && fax) return `${phone} / Fax ${fax}`;
  if (phone) return phone;
  return fax ? `Fax ${fax}` : '';
}

/** When a signed authorization stops being good ('' when it runs to the end
 *  of services and so has no fixed date). */
export function roiExpiresOn(signedYmd: string, duration: RoiDuration): string {
  if (duration !== 'year' || !/^\d{4}-\d{2}-\d{2}$/.test(signedYmd)) return '';
  const [y, m, d] = signedYmd.split('-').map(Number);
  // One year to the day; Feb 29 falls back to Feb 28.
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * The introduction letter that goes in front of the signed form when it is
 * faxed: who we are, what we do for this member, and why the facility is
 * getting the release. No em or en dashes (printed deliverable).
 */
export function roiIntroParagraphs(p: { memberName: string; program: string | undefined; facilityName: string; direction: RoiDirection }): string[] {
  const prog = getProgram(p.program)?.label;
  const under = prog ? ` under the ${prog} program` : '';
  const flow =
    p.direction === 'to-us'
      ? `allows ${p.facilityName} to share ${p.memberName}'s health information with Heart and Soul Healthcare`
      : p.direction === 'from-us'
        ? `allows Heart and Soul Healthcare to share ${p.memberName}'s health information with ${p.facilityName}`
        : `allows ${p.facilityName} and Heart and Soul Healthcare to share ${p.memberName}'s health information with each other`;
  return [
    `Heart and Soul Healthcare is a Georgia home care agency that provides skilled nursing services${under}. We provide skilled nursing care to ${p.memberName} and are part of the care team.`,
    `Enclosed is an Authorization for Release of Information (DBHDD Policy 23-110, Attachment A), signed by ${p.memberName} or a legally authorized representative. It ${flow}, so that we can coordinate care and keep everyone on the care team informed.`,
    `Please keep this authorization on file with ${p.memberName}'s record and add Heart and Soul Healthcare as a care team contact. If you have questions, or need anything else from us, please call us at the number below.`,
  ];
}

export type RoiStatus = 'awaiting-signature' | 'signed' | 'cancelled';

/** A Release of Information as the Fax Center lists it. */
export interface RoiRecord {
  id: string;
  patientId: string;
  memberName: string;
  direction: RoiDirection;
  facility: RoiParty;
  information: string;
  purpose: string;
  duration: RoiDuration;
  status: RoiStatus;
  createdAt: string | null;
  createdByName: string;
  /** Filled once the signed copy is uploaded. */
  signed: { documentId: string; signedDate: string; expiresOn: string; byName: string } | null;
  faxes: Array<{ faxId: string; toNumber: string; recipientName: string; at: string; byName: string }>;
  hidden: boolean;
}

export const ROI_MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Cover-sheet message when the signed release is faxed with its letter. */
export function defaultRoiFaxNote(memberName: string): string {
  return `Please see the attached introduction letter and the signed Authorization for Release of Information for ${memberName}. Please keep them on file with ${memberName}'s record and add Heart and Soul Healthcare as a care team contact.`;
}
