import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue, type Timestamp } from 'firebase-admin/firestore';
import { adminBucket, adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import {
  HEALTHCARE_PLAN_CATEGORY,
  type HealthcarePlanReader,
  type HealthcarePlanStatus,
} from './healthcarePlanReview';

/**
 * Healthcare plan read receipts, server side.
 *
 * Receipts live in `healthcarePlanReviews`, which no browser can read or
 * write (the rules' default deny covers it): every read and write goes
 * through these functions. That is deliberate.
 *  - Access does not depend on care-team membership. assignedNurseIds is only
 *    seeded when a nurse submits her first note for a client, so the
 *    Documents rules would lock a nurse out of the plans on the very shift
 *    she most needs them. Any active clinician may open a client's
 *    healthcare plans here (the same population that may chart care tasks),
 *    and ONLY documents in the Healthcare Plan category.
 *  - A receipt is proof: the server stamps the open when it serves the file,
 *    and accepts an acknowledgment only for a version it served to that user.
 *
 * One receipt per (document, user, file version). Replacing a document's file
 * changes its storagePath, so the version changes and earlier receipts stop
 * covering it; they stay on file as history.
 */

const COLLECTION = 'healthcarePlanReviews';
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

const SERVABLE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export class HealthcarePlanError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function planVersion(storagePath: string): string {
  return createHash('sha256').update(storagePath).digest('hex').slice(0, 16);
}

function receiptId(documentId: string, uid: string, version: string): string {
  return `${documentId}__${uid}__${version}`;
}

function iso(value: unknown): string {
  const t = value as Timestamp | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : '';
}

interface PlanDoc {
  id: string;
  patientId: string;
  title: string;
  docDate: string;
  storagePath: string;
  fileName: string;
  version: string;
}

async function currentPlans(patientId: string): Promise<PlanDoc[]> {
  const snap = await adminDb().collection('patientDocuments').where('patientId', '==', patientId).get();
  return snap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => data.category === HEALTHCARE_PLAN_CATEGORY && data.archived !== true && typeof data.storagePath === 'string' && data.storagePath)
    .map(({ id, data }) => ({
      id,
      patientId,
      title: String(data.title || data.fileName || 'Healthcare plan'),
      docDate: String(data.docDate || ''),
      storagePath: String(data.storagePath),
      fileName: String(data.fileName || 'document'),
      version: planVersion(String(data.storagePath)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** A current (unarchived) Healthcare Plan document, or a 404. */
async function loadPlan(documentId: string): Promise<PlanDoc> {
  if (!ID_RE.test(documentId)) throw new HealthcarePlanError(400, 'documentId is required.');
  const snap = await adminDb().collection('patientDocuments').doc(documentId).get();
  const data = snap.data();
  if (!snap.exists || !data || data.category !== HEALTHCARE_PLAN_CATEGORY || data.archived === true || !data.storagePath) {
    throw new HealthcarePlanError(404, 'That healthcare plan is no longer on file. Reload the list.');
  }
  return {
    id: snap.id,
    patientId: String(data.patientId || ''),
    title: String(data.title || data.fileName || 'Healthcare plan'),
    docDate: String(data.docDate || ''),
    storagePath: String(data.storagePath),
    fileName: String(data.fileName || 'document'),
    version: planVersion(String(data.storagePath)),
  };
}

export interface HealthcarePlanListing {
  plans: HealthcarePlanStatus[];
  /** Present for staff only: who has reviewed what. */
  readers?: HealthcarePlanReader[];
}

/**
 * The client's current plans with the caller's own receipt state, plus (for
 * staff) every clinician's progress against the current versions.
 */
export async function listHealthcarePlans(patientId: string, caller: AuthedCaller): Promise<HealthcarePlanListing> {
  if (!ID_RE.test(patientId)) throw new HealthcarePlanError(400, 'patientId is required.');
  const db = adminDb();
  const plans = await currentPlans(patientId);
  if (plans.length === 0) return { plans: [] };

  const receiptSnap = await db.collection(COLLECTION).where('patientId', '==', patientId).get();
  const receipts = receiptSnap.docs.map((d) => d.data());

  const mine = receipts.filter((r) => r.nurseId === caller.uid);
  const statuses: HealthcarePlanStatus[] = plans.map((p) => {
    const current = mine.find((r) => r.documentId === p.id && r.version === p.version);
    const reviewedAt = iso(current?.reviewedAt);
    const earlier = reviewedAt
      ? ''
      : mine
          .filter((r) => r.documentId === p.id && r.version !== p.version)
          .map((r) => iso(r.reviewedAt))
          .filter(Boolean)
          .sort()
          .at(-1) || '';
    return {
      documentId: p.id,
      title: p.title,
      docDate: p.docDate,
      version: p.version,
      openedAt: iso(current?.openedAt),
      reviewedAt,
      previousReviewedAt: earlier,
    };
  });

  if (caller.role !== 'admin' && caller.role !== 'supervisor') return { plans: statuses };

  const patientSnap = await db.collection('patients').doc(patientId).get();
  const team: string[] = Array.isArray(patientSnap.data()?.assignedNurseIds) ? patientSnap.data()!.assignedNurseIds : [];
  const versionOf = new Map(plans.map((p) => [p.id, p.version]));
  const byUid = new Map<string, HealthcarePlanReader>();
  const ensure = (uid: string) => {
    let r = byUid.get(uid);
    if (!r) {
      r = { uid, name: '', credential: '', onCareTeam: team.includes(uid), reviewed: {} };
      byUid.set(uid, r);
    }
    return r;
  };
  for (const uid of team) if (typeof uid === 'string' && uid) ensure(uid);
  for (const r of receipts) {
    const reviewedAt = iso(r.reviewedAt);
    if (!reviewedAt || typeof r.nurseId !== 'string' || versionOf.get(r.documentId) !== r.version) continue;
    const reader = ensure(r.nurseId);
    reader.reviewed[r.documentId] = reviewedAt;
    if (!reader.name) reader.name = String(r.nurseName || '');
    if (!reader.credential) reader.credential = String(r.nurseCredential || '');
  }
  const uids = [...byUid.keys()];
  if (uids.length > 0) {
    const userSnaps = await db.getAll(...uids.map((uid) => db.collection('users').doc(uid)));
    for (const s of userSnaps) {
      const reader = byUid.get(s.id);
      const u = s.data();
      if (!reader || !u) continue;
      // Deactivated accounts and non-clinical roles drop off unless they hold a receipt.
      if ((u.active === false || u.role === 'va') && Object.keys(reader.reviewed).length === 0) {
        byUid.delete(s.id);
        continue;
      }
      reader.name = String(u.displayName || u.name || reader.name || u.email || 'Unknown');
      reader.credential = String(u.credential || reader.credential || '');
    }
  }
  const readers = [...byUid.values()].sort((a, b) => Number(b.onCareTeam) - Number(a.onCareTeam) || a.name.localeCompare(b.name));
  return { plans: statuses, readers };
}

/**
 * The plan's bytes for viewing. Serving the file stamps the caller's
 * "opened" time for this version (first open wins), which is what lets her
 * acknowledge it afterwards.
 */
export async function openHealthcarePlan(documentId: string, caller: AuthedCaller): Promise<{ bytes: Buffer; contentType: string; fileName: string }> {
  const plan = await loadPlan(documentId);
  const file = adminBucket().file(plan.storagePath);
  const [[bytes], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  const stored = String(meta.contentType || '');
  const contentType = SERVABLE_TYPES.has(stored) ? stored : 'application/octet-stream';

  const ref = adminDb().collection(COLLECTION).doc(receiptId(plan.id, caller.uid, plan.version));
  try {
    await ref.create({
      patientId: plan.patientId,
      documentId: plan.id,
      version: plan.version,
      storagePath: plan.storagePath,
      title: plan.title,
      docDate: plan.docDate,
      nurseId: caller.uid,
      nurseName: caller.profile.displayName || caller.email || '',
      nurseRole: caller.role,
      nurseCredential: caller.profile.credential || '',
      openedAt: FieldValue.serverTimestamp(),
      reviewedAt: null,
    });
  } catch (err) {
    // ALREADY_EXISTS (gRPC code 6): she has opened this version before.
    if ((err as { code?: number }).code !== 6) throw err;
  }
  return { bytes, contentType, fileName: plan.fileName };
}

/**
 * Record the caller's acknowledgment of the plan's current version. Refused
 * unless the server has served her that version. Idempotent: the first
 * acknowledgment's time is kept.
 */
export async function acknowledgeHealthcarePlan(documentId: string, caller: AuthedCaller): Promise<{ reviewedAt: string }> {
  const plan = await loadPlan(documentId);
  const db = adminDb();
  const ref = db.collection(COLLECTION).doc(receiptId(plan.id, caller.uid, plan.version));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || !snap.data()?.openedAt) {
      throw new HealthcarePlanError(409, 'Open the plan and read it before marking it as read.');
    }
    if (!snap.data()?.reviewedAt) tx.update(ref, { reviewedAt: FieldValue.serverTimestamp() });
  });
  const after = await ref.get();
  return { reviewedAt: iso(after.data()?.reviewedAt) };
}
