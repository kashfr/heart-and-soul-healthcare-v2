// EDWP (CCSP / SOURCE) client consent form: the shared vocabulary the public
// form, the intake API, the PDF, and the admin list all speak. Mirrors the
// paper "EDWP Client Consent Form" so a signed-online copy reads the same as a
// signed-on-paper one. No server imports here: the browser form uses the option
// lists and validator too.

export const EDWP_PROGRAM_OPTIONS = [
  { value: 'ccsp', label: 'CCSP (Community Care Services Program)' },
  { value: 'source', label: 'SOURCE (Service Options Using Resources in a Community Environment)' },
  { value: 'unsure', label: 'Not sure yet' },
] as const;
export type EdwpProgram = (typeof EDWP_PROGRAM_OPTIONS)[number]['value'];

export const EDWP_SERVICE_OPTIONS = [
  { value: 'pss', label: 'Personal Support Services' },
  { value: 'nursing', label: 'Skilled Nursing' },
  { value: 'respite', label: 'Respite Care' },
  { value: 'other', label: 'Other' },
] as const;
export type EdwpService = (typeof EDWP_SERVICE_OPTIONS)[number]['value'];

export type SignerType = 'client' | 'representative';

/** The statements the signer agrees to. Numbered on the PDF in this order. */
export const EDWP_CONSENT_STATEMENTS: readonly string[] = [
  'I consent to receive home and community based services from Heart and Soul Healthcare, LLC under the CCSP or SOURCE program, as authorized in my approved care plan.',
  'I authorize Heart and Soul Healthcare, LLC to obtain, use, and share my health and service information with my care coordinator or case management agency, the Georgia Department of Community Health, and other providers involved in my care, for the purposes of treatment, payment, and program operations.',
  'I understand that my participation is voluntary, that I may choose or change providers, and that I may withdraw this consent at any time by notifying Heart and Soul Healthcare, LLC in writing. Withdrawal will not affect information already shared.',
  'I understand that my information will be kept confidential and protected in accordance with HIPAA and applicable Georgia law, and that I may request a copy of this form and of the Notice of Privacy Practices.',
  'I confirm that the information provided on this form is accurate to the best of my knowledge, and I agree to notify Heart and Soul Healthcare, LLC of any changes to my contact information, Medicaid eligibility, or care coordinator.',
];

/** Bumped whenever the statements above change, so a stored consent records
 *  exactly which wording the client agreed to. */
export const EDWP_CONSENT_VERSION = '2026-09-15';

export interface EdwpConsentInput {
  // Client
  clientName: string;
  dob: string; // YYYY-MM-DD
  address: string;
  medicaidId: string;
  phone: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  // Program & care coordination
  program: EdwpProgram | '';
  careCoordinatorName: string;
  careCoordinatorAgency: string;
  careCoordinatorPhone: string;
  services: EdwpService[];
  servicesOther: string;
  // Consent & signature
  agreed: boolean;
  signerType: SignerType;
  signerName: string;
  signerRelationship: string;
  /** PNG data URL from the signature pad. */
  signature: string;
  /** Present when the client opened the form from a staff-sent link. */
  inviteToken?: string;
}

export const EMPTY_EDWP_CONSENT: EdwpConsentInput = {
  clientName: '',
  dob: '',
  address: '',
  medicaidId: '',
  phone: '',
  email: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  program: '',
  careCoordinatorName: '',
  careCoordinatorAgency: '',
  careCoordinatorPhone: '',
  services: [],
  servicesOther: '',
  agreed: false,
  signerType: 'client',
  signerName: '',
  signerRelationship: '',
  signature: '',
};

export const PROGRAM_LABEL: Record<EdwpProgram, string> = Object.fromEntries(
  EDWP_PROGRAM_OPTIONS.map((o) => [o.value, o.label])
) as Record<EdwpProgram, string>;

export const SERVICE_LABEL: Record<EdwpService, string> = Object.fromEntries(
  EDWP_SERVICE_OPTIONS.map((o) => [o.value, o.label])
) as Record<EdwpService, string>;

/** Readable list of chosen services, with "Other" expanded to what they typed. */
export function serviceLabels(services: EdwpService[], other: string): string[] {
  return services.map((s) =>
    s === 'other' && other.trim() ? `Other: ${other.trim()}` : SERVICE_LABEL[s]
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// A drawn signature is a PNG data URL. Anything else (SVG, a remote URL, HTML)
// is refused before it can reach the PDF renderer or an email.
const SIGNATURE_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
/** Generous cap for a 600x200 signature pad; a real signature is well under it. */
export const MAX_SIGNATURE_BYTES = 200 * 1024;

const isValidProgram = (v: string): v is EdwpProgram =>
  EDWP_PROGRAM_OPTIONS.some((o) => o.value === v);
const isValidService = (v: string): v is EdwpService =>
  EDWP_SERVICE_OPTIONS.some((o) => o.value === v);

/**
 * Field-level validation shared by the browser form (inline messages) and the
 * intake route (the source of truth). Returns an empty object when valid.
 */
export function validateEdwpConsent(
  input: EdwpConsentInput
): Partial<Record<keyof EdwpConsentInput, string>> {
  const errors: Partial<Record<keyof EdwpConsentInput, string>> = {};

  if (!input.clientName.trim()) errors.clientName = 'Client name is required.';
  if (!input.dob) errors.dob = 'Date of birth is required.';
  else if (!DATE_RE.test(input.dob) || Number.isNaN(new Date(`${input.dob}T00:00:00`).getTime())) {
    errors.dob = 'Enter a valid date of birth.';
  } else if (new Date(`${input.dob}T00:00:00`) > new Date()) {
    errors.dob = 'Date of birth cannot be in the future.';
  }
  if (!input.address.trim()) errors.address = 'Home address is required.';
  if (!input.phone.trim()) errors.phone = 'Phone number is required.';
  if (input.email.trim() && !EMAIL_RE.test(input.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (!input.program) errors.program = 'Choose a program.';
  else if (!isValidProgram(input.program)) errors.program = 'Choose a valid program.';

  if (input.services.some((s) => !isValidService(s))) {
    errors.services = 'One of the selected services is not recognized.';
  }
  if (input.services.includes('other') && !input.servicesOther.trim()) {
    errors.servicesOther = 'Describe the other service you are requesting.';
  }

  if (!input.agreed) errors.agreed = 'You must agree to the consent statements to continue.';
  if (input.signerType !== 'client' && input.signerType !== 'representative') {
    errors.signerType = 'Choose who is signing.';
  }
  if (!input.signerName.trim()) errors.signerName = 'Type the full name of the person signing.';
  if (input.signerType === 'representative' && !input.signerRelationship.trim()) {
    errors.signerRelationship = 'Tell us your relationship to the client.';
  }
  if (!input.signature) errors.signature = 'Please sign in the box.';
  else if (!SIGNATURE_RE.test(input.signature) || input.signature.length > MAX_SIGNATURE_BYTES) {
    errors.signature = 'The signature could not be read. Please clear it and sign again.';
  }

  return errors;
}

/** Trim every free-text field and drop unknown keys, so what gets stored is
 *  exactly the shape above regardless of what the browser sent. */
export function normalizeEdwpConsent(raw: unknown): EdwpConsentInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (k: string, max = 500): string =>
    typeof r[k] === 'string' ? (r[k] as string).trim().slice(0, max) : '';
  const services = Array.isArray(r.services)
    ? (r.services.filter((s): s is string => typeof s === 'string') as EdwpService[])
    : [];
  return {
    clientName: str('clientName', 120),
    dob: str('dob', 10),
    address: str('address', 300),
    medicaidId: str('medicaidId', 40),
    phone: str('phone', 30),
    email: str('email', 120),
    emergencyContactName: str('emergencyContactName', 120),
    emergencyContactPhone: str('emergencyContactPhone', 30),
    program: str('program', 20) as EdwpProgram | '',
    careCoordinatorName: str('careCoordinatorName', 120),
    careCoordinatorAgency: str('careCoordinatorAgency', 120),
    careCoordinatorPhone: str('careCoordinatorPhone', 30),
    services: Array.from(new Set(services)),
    servicesOther: str('servicesOther', 200),
    agreed: r.agreed === true,
    signerType: r.signerType === 'representative' ? 'representative' : 'client',
    signerName: str('signerName', 120),
    signerRelationship: str('signerRelationship', 80),
    signature: typeof r.signature === 'string' ? r.signature : '',
    inviteToken: str('inviteToken', 100) || undefined,
  };
}
