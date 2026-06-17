import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

// Unified referral store. Both intake sources write here:
//   - 'gapp-website'  -> the Georgia Pediatric Program site's referral form
//                         (forwarded to /api/referrals/intake)
//   - 'hs-website'    -> this site's own /referral marketing form
// The admin Referrals tab reads from this collection.

const COLLECTION = 'referrals';

export type ReferralSource = 'gapp-website' | 'hs-website';
export type ReferralStatus = 'new' | 'contacted' | 'archived';

/** An ordered label/value pair shown verbatim in the referral detail view. */
export interface ReferralDetail {
  label: string;
  value: string;
}

/** What a caller provides to create a referral. */
export interface ReferralInput {
  source: ReferralSource;
  /** Stable id from the origin system; used to dedupe retried deliveries. */
  externalId?: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  county?: string;
  program?: string;
  referrerName?: string;
  /** Full submission, rendered as-is in the detail view. */
  details: ReferralDetail[];
}

/** A referral as returned to the admin UI (timestamps serialized to ISO). */
export interface Referral extends ReferralInput {
  id: string;
  status: ReferralStatus;
  submittedAt: string | null;
}

function normalizeDetails(details: ReferralDetail[]): ReferralDetail[] {
  return (details || [])
    .filter((d) => d && d.value != null && String(d.value).trim() !== '')
    .map((d) => ({ label: String(d.label), value: String(d.value) }));
}

// Deterministic, Firestore-safe document id derived from the origin's id, so
// the same externalId always maps to the same document. That lets create()
// serve as an atomic dedupe (no read-then-write race).
function docIdForExternal(externalId: string): string {
  return `ext_${createHash('sha256').update(externalId).digest('hex').slice(0, 40)}`;
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string };
  return e?.code === 6 || /already exists/i.test(e?.message ?? '');
}

/**
 * Create a referral. If `externalId` is supplied and a referral with that id
 * already exists, this is an atomic no-op that returns the existing id and
 * `deduped: true`, so a retried or double-submitted delivery never produces a
 * duplicate document or a second notification email.
 */
export async function createReferral(
  input: ReferralInput
): Promise<{ id: string; deduped: boolean }> {
  const data = {
    source: input.source,
    externalId: input.externalId ?? null,
    status: 'new' as ReferralStatus,
    clientName: input.clientName,
    clientEmail: input.clientEmail,
    clientPhone: input.clientPhone,
    county: input.county ?? '',
    program: input.program ?? '',
    referrerName: input.referrerName ?? '',
    details: normalizeDetails(input.details),
    submittedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

  // With a stable externalId: deterministic id + create(). create() rejects if
  // the document already exists, making concurrent/retried deliveries an atomic
  // no-op rather than a duplicate.
  if (input.externalId) {
    const ref = adminDb().collection(COLLECTION).doc(docIdForExternal(input.externalId));
    try {
      await ref.create(data);
      return { id: ref.id, deduped: false };
    } catch (err) {
      if (isAlreadyExists(err)) return { id: ref.id, deduped: true };
      throw err;
    }
  }

  // No externalId (e.g. the on-site marketing form): plain auto-id document.
  const ref = adminDb().collection(COLLECTION).doc();
  await ref.set(data);
  return { id: ref.id, deduped: false };
}

/** All referrals, newest first. */
export async function listReferrals(): Promise<Referral[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .orderBy('submittedAt', 'desc')
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    const submittedAt = data.submittedAt;
    return {
      id: d.id,
      source: data.source,
      externalId: data.externalId ?? undefined,
      status: (data.status as ReferralStatus) ?? 'new',
      clientName: data.clientName ?? '',
      clientEmail: data.clientEmail ?? '',
      clientPhone: data.clientPhone ?? '',
      county: data.county ?? '',
      program: data.program ?? '',
      referrerName: data.referrerName ?? '',
      details: Array.isArray(data.details) ? data.details : [],
      submittedAt:
        submittedAt && typeof submittedAt.toDate === 'function'
          ? submittedAt.toDate().toISOString()
          : null,
    };
  });
}

const VALID_STATUSES: ReferralStatus[] = ['new', 'contacted', 'archived'];

/** Update a referral's status, with an audit stamp. Returns false if missing. */
export async function updateReferralStatus(
  id: string,
  status: ReferralStatus,
  caller: AuthedCaller
): Promise<boolean> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid status.');
  }
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  await ref.update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: caller.uid,
    statusUpdatedByName: caller.profile.displayName || '',
  });
  return true;
}
