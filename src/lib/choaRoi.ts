/** CHOA's medical-records authorization, verified against choa.org on 2026-10-06. */
export const CHOA = {
  name: "Children's Healthcare of Atlanta",
  address: '1575 Northeast Expressway NE, Atlanta, GA 30329',
  phone: '4047852431',
  fax: '4047859060',
  email: 'HISROITeam@choa.org',
  instructionsUrl: 'https://www.choa.org/patients/medical-records',
  formUrl: 'https://www.choa.org/-/media/Files/Childrens/patients/medical-records/medical-records-authorization-form.pdf',
} as const;

export const CHOA_RECORD_TYPES = {
  routine: { label: 'Routine record set', field: 'Routin record set' },
  hospital: { label: 'Hospital records', field: 'Hospital records' },
  emergency: { label: 'Emergency room records', field: 'ER records' },
  clinic: { label: 'Clinic records', field: 'Clinic records' },
  surgery: { label: 'Surgery records', field: 'Surgery records' },
  labs: { label: 'Lab reports', field: 'Lab reports' },
  immunizations: { label: 'Immunizations', field: 'Immunizations' },
  radiologyReports: { label: 'Radiology / EEG reports', field: 'Radiology/EEG reports' },
  all: { label: 'Any and all records for these dates', field: 'Any and all records' },
} as const;

export type ChoaRecordType = keyof typeof CHOA_RECORD_TYPES;
export interface ChoaRequest {
  /** Empty explicitly means all CHOA locations. */
  location: string;
  dateFrom: string;
  dateTo: string;
  recordTypes: ChoaRecordType[];
}
export type ChoaField = 'choaLocation' | 'choaDates' | 'choaRecordTypes';

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateChoaRequest(raw: unknown): { errors: Partial<Record<ChoaField, string>>; value: ChoaRequest | null } {
  const x = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const location = String(x.location || '').trim();
  const dateFrom = String(x.dateFrom || '');
  const dateTo = String(x.dateTo || '');
  const errors: Partial<Record<ChoaField, string>> = {};
  if (location.length > 70) errors.choaLocation = 'Keep the location under 70 characters so it fits on the form.';
  if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) errors.choaDates = 'Enter a valid start and end date, with the start on or before the end.';
  const keys = Object.keys(CHOA_RECORD_TYPES);
  const types = Array.isArray(x.recordTypes) ? x.recordTypes : [];
  if (!types.length || types.some((t) => typeof t !== 'string' || !keys.includes(t))) errors.choaRecordTypes = 'Choose at least one supported record type.';
  const recordTypes = Array.from(new Set(types)) as ChoaRecordType[];
  if (recordTypes.includes('all') && recordTypes.length > 1) errors.choaRecordTypes = 'Choose either all records or specific record types.';
  return { errors, value: Object.keys(errors).length ? null : { location, dateFrom, dateTo, recordTypes } };
}

export function choaInformation(request: ChoaRequest): string {
  return `${request.recordTypes.map((type) => CHOA_RECORD_TYPES[type].label).join(', ')}; dates of service ${request.dateFrom} through ${request.dateTo}.`;
}
