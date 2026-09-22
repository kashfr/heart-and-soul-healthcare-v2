import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { HoursBucket } from './shiftHours';

/**
 * Billing rate table (owner-only): what each payer program pays per
 * 15-minute unit for shift nursing and for RN oversight, with the procedure
 * code + modifier for the claim and an effective window so a rate change is
 * a new row, not an overwrite. The dollar views resolve a note's rate from
 * the client's program, the bucket, and the date of the hours.
 *
 * Firebase-free math lives in billingRatesShared.ts.
 */
export const BILLING_RATES_COLLECTION = 'billingRates';

export interface BillingRate {
  id?: string;
  /** Program id from programs.ts ('now-comp' | 'gapp' | 'edwp' | 'icwp'). */
  program: string;
  /** Which hours this rate prices. */
  bucket: HoursBucket;
  /** Nurse type this row is limited to ('LPN', 'RN', 'HHA', 'CNA'); '' = any. */
  credential: string;
  /** Procedure code on the claim, e.g. 'T1003'. Display / reference. */
  serviceCode: string;
  /** Modifier(s), e.g. 'U1'. Display / reference. */
  modifier: string;
  /** Free text, e.g. 'Nursing Services - LPN'. */
  description: string;
  /** Dollars per 15-minute unit. */
  ratePerUnit: number;
  /** 'YYYY-MM-DD' effective window; `to` '' = open-ended. */
  effectiveFrom: string;
  effectiveTo: string;
  note?: string;
}

export type BillingRateInput = Omit<BillingRate, 'id'>;

function toRate(id: string, d: Record<string, unknown>): BillingRate {
  const n = typeof d.ratePerUnit === 'number' && Number.isFinite(d.ratePerUnit) ? d.ratePerUnit : 0;
  return {
    id,
    program: String(d.program || ''),
    bucket: d.bucket === 'oversight' ? 'oversight' : 'shift',
    credential: String(d.credential || '').toUpperCase(),
    serviceCode: String(d.serviceCode || ''),
    modifier: String(d.modifier || ''),
    description: String(d.description || ''),
    ratePerUnit: n,
    effectiveFrom: String(d.effectiveFrom || ''),
    effectiveTo: String(d.effectiveTo || ''),
    note: typeof d.note === 'string' ? d.note : '',
  };
}

export async function getBillingRates(): Promise<BillingRate[]> {
  const snap = await getDocs(collection(db, BILLING_RATES_COLLECTION));
  return snap.docs
    .map((d) => toRate(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => a.program.localeCompare(b.program) || a.bucket.localeCompare(b.bucket) || a.credential.localeCompare(b.credential) || b.effectiveFrom.localeCompare(a.effectiveFrom));
}

function payload(input: BillingRateInput, uid: string) {
  return {
    program: input.program,
    bucket: input.bucket,
    credential: (input.credential || '').trim().toUpperCase(),
    serviceCode: input.serviceCode.trim(),
    modifier: input.modifier.trim(),
    description: input.description.trim(),
    ratePerUnit: input.ratePerUnit,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    note: (input.note || '').trim(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
}

export async function addBillingRate(input: BillingRateInput, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, BILLING_RATES_COLLECTION), { ...payload(input, uid), createdAt: serverTimestamp(), createdBy: uid });
  return ref.id;
}

export async function updateBillingRate(id: string, input: BillingRateInput, uid: string): Promise<void> {
  await updateDoc(doc(db, BILLING_RATES_COLLECTION, id), payload(input, uid));
}

export async function deleteBillingRate(id: string): Promise<void> {
  await deleteDoc(doc(db, BILLING_RATES_COLLECTION, id));
}
