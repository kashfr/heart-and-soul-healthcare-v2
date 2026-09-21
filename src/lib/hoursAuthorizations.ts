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
import type { HoursAuthorization, HoursBucket, RateBasis } from './shiftHours';

/**
 * Authorized nursing hours per client, transcribed from the payer's paperwork:
 * a GAPP Letter of Notification (weekly rate plus a per-month block table,
 * shift hours only) or a Therap Service Authorization line (NOW/COMP: hours
 * daily for the LPN line, hours monthly for the RN oversight line, plus an
 * annual total in 15-minute units). Owner-only:
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
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // Lines written before the NOW/COMP work carried only hoursPerWeek; read
  // them as a weekly shift-hours rate so nothing needs a migration to render.
  const legacyWeekly = num(data.hoursPerWeek);
  const rateBasis: RateBasis =
    data.rateBasis === 'day' || data.rateBasis === 'month' || data.rateBasis === 'week' ? data.rateBasis : 'week';
  const covers: HoursBucket = data.covers === 'oversight' ? 'oversight' : 'shift';
  return {
    id,
    patientId: String(data.patientId || ''),
    paNumber: String(data.paNumber || ''),
    kind: data.kind === 'unskilled' ? 'unskilled' : 'skilled',
    covers,
    rateBasis,
    rateHours: 'rateHours' in data ? num(data.rateHours) : legacyWeekly,
    from: String(data.from || ''),
    to: String(data.to || ''),
    monthOverrides,
    totalUnits: num(data.totalUnits),
    serviceCode: typeof data.serviceCode === 'string' ? data.serviceCode : '',
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
    covers: input.covers,
    rateBasis: input.rateBasis,
    rateHours: input.rateHours,
    from: input.from,
    to: input.to,
    monthOverrides: input.monthOverrides,
    totalUnits: input.totalUnits,
    serviceCode: (input.serviceCode || '').trim(),
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
