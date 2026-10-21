/**
 * The doctors who treat a client: primary care and every specialist, with
 * the practice's address, phone, and fax. Separate from the clinical
 * profile's single attending physician, which is where verbal orders and
 * PPOT requests are addressed; this list is the reference directory.
 *
 * Origin (09/2026): Ricky Yancey's endocrinologist had changed (Athens to
 * Piedmont Buckhead) with no fax number anywhere in his record, and his
 * optometrist had been entered as his attending physician.
 *
 * Pure module (no Firestore) so validation is unit-testable.
 */
import { formatUSFaxNumber, normalizeUSFaxNumber } from './verbalOrderShared';

export const PHYSICIAN_SPECIALTIES = [
  'Primary Care',
  'Endocrinology',
  'Neurology',
  'Cardiology',
  'Gastroenterology',
  'Pulmonology',
  'Nephrology',
  'Urology',
  'Psychiatry',
  'Podiatry',
  'Ophthalmology / Optometry',
  'Dentistry',
  'Orthopedics',
  'Hematology / Oncology',
  'Infectious Disease',
  'Other',
] as const;

export interface Physician {
  id: string;
  name: string;
  specialty: string;
  practice?: string;
  address?: string;
  phone?: string;
  fax?: string;
  notes?: string; // source, last visit, anything else
}

export interface PhysicianList {
  list: Physician[];
  updatedAt?: unknown;
  updatedByName?: string;
}

export type PhysicianErrorKey = 'name' | 'specialty' | 'fax';
export type PhysicianErrors = Record<string, Partial<Record<PhysicianErrorKey, string>>>;

/** Per-row errors keyed by physician id. Empty object means clean. */
export function validatePhysicians(list: Physician[]): PhysicianErrors {
  const out: PhysicianErrors = {};
  for (const p of list) {
    const e: Partial<Record<PhysicianErrorKey, string>> = {};
    if (!(p.name || '').trim()) e.name = "Enter the doctor's name.";
    if (!(p.specialty || '').trim()) e.specialty = 'Choose a specialty.';
    if ((p.fax || '').trim() && !normalizeUSFaxNumber(p.fax || '')) e.fax = 'Enter a 10-digit fax number.';
    if (Object.keys(e).length) out[p.id] = e;
  }
  return out;
}

/** Trimmed rows with the fax in (xxx) xxx-xxxx form, primary care first. */
export function normalizePhysicians(list: Physician[]): Physician[] {
  const t = (v?: string) => (v || '').trim();
  const rows = list.map((p) => ({
    id: p.id,
    name: t(p.name),
    specialty: t(p.specialty),
    practice: t(p.practice),
    address: t(p.address),
    phone: t(p.phone),
    fax: t(p.fax) ? formatUSFaxNumber(t(p.fax)) : '',
    notes: t(p.notes),
  }));
  return rows.sort((a, b) => Number(b.specialty === 'Primary Care') - Number(a.specialty === 'Primary Care'));
}
