import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { HoursAuthorization } from './shiftHours';

/**
 * Authorized nursing hours per client, transcribed from the payer's Letter of
 * Notification (GAPP: a weekly rate plus a per-month block table). Owner-only:
 * the collection is admin-read/admin-write in firestore.rules, so nurses and
 * supervisors cannot see a client's caps or how close she is to them. The
 * math that turns these into "hours left this month" lives in shiftHours.ts.
 *
 * Top-level collection keyed by patientId (rather than a sub-document under
 * the patient) so the roster can load every client's authorizations in one
 * query without a collection-group index.
 */
export const HOURS_AUTH_COLLECTION = 'hoursAuthorizations';

type Raw = Record<string, unknown>;

function toAuth(id: string, data: Raw): HoursAuthorization {
  const overridesRaw = (data.monthOverrides as Record<string, unknown> | undefined) ?? {};
  const monthOverrides: Record<string, number> = {};
  for (const [k, v] of Object.entries(overridesRaw)) {
    if (typeof v === 'number' && Number.isFinite(v)) monthOverrides[k] = v;
  }
  const weekly = data.hoursPerWeek;
  return {
    id,
    patientId: String(data.patientId || ''),
    paNumber: String(data.paNumber || ''),
    kind: data.kind === 'unskilled' ? 'unskilled' : 'skilled',
    hoursPerWeek: typeof weekly === 'number' && Number.isFinite(weekly) ? weekly : null,
    from: String(data.from || ''),
    to: String(data.to || ''),
    monthOverrides,
    note: typeof data.note === 'string' ? data.note : '',
  };
}

function sortByFromDesc(list: HoursAuthorization[]): HoursAuthorization[] {
  return list.sort((a, b) => b.from.localeCompare(a.from));
}

/** All authorizations for one client, newest window first. */
export async function getHoursAuthorizationsForPatient(patientId: string): Promise<HoursAuthorization[]> {
  const q = query(collection(db, HOURS_AUTH_COLLECTION), where('patientId', '==', patientId));
  const snap = await getDocs(q);
  return sortByFromDesc(snap.docs.map((d) => toAuth(d.id, d.data() as Raw)));
}

/** Every client's authorizations (admin roster badges), keyed by patientId. */
export async function getAllHoursAuthorizations(): Promise<Map<string, HoursAuthorization[]>> {
  const snap = await getDocs(collection(db, HOURS_AUTH_COLLECTION));
  const out = new Map<string, HoursAuthorization[]>();
  for (const d of snap.docs) {
    const a = toAuth(d.id, d.data() as Raw);
    if (!a.patientId) continue;
    const list = out.get(a.patientId) ?? [];
    list.push(a);
    out.set(a.patientId, list);
  }
  for (const list of out.values()) sortByFromDesc(list);
  return out;
}

export type HoursAuthorizationInput = Omit<HoursAuthorization, 'id'>;

function toPayload(input: HoursAuthorizationInput, uid: string) {
  return {
    patientId: input.patientId,
    paNumber: input.paNumber.trim(),
    kind: input.kind,
    hoursPerWeek: input.hoursPerWeek,
    from: input.from,
    to: input.to,
    monthOverrides: input.monthOverrides,
    note: (input.note || '').trim(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
}

export async function addHoursAuthorization(input: HoursAuthorizationInput, uid: string): Promise<string> {
  const ref = await addDoc(collection(db, HOURS_AUTH_COLLECTION), {
    ...toPayload(input, uid),
    createdAt: serverTimestamp(),
    createdBy: uid,
  });
  return ref.id;
}

export async function updateHoursAuthorization(id: string, input: HoursAuthorizationInput, uid: string): Promise<void> {
  await updateDoc(doc(db, HOURS_AUTH_COLLECTION, id), toPayload(input, uid));
}

export async function deleteHoursAuthorization(id: string): Promise<void> {
  await deleteDoc(doc(db, HOURS_AUTH_COLLECTION, id));
}
