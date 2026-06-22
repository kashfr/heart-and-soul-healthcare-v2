import 'server-only';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

// Unified referral store. Both intake sources write here:
//   - 'gapp-website'  -> the Georgia Pediatric Program site's referral form
//                         (forwarded to /api/referrals/intake)
//   - 'hs-website'    -> this site's own /referral marketing form
// The admin Referrals tab reads from this collection and renders it as a
// Trello/ClickUp-style pipeline board.

const COLLECTION = 'referrals';

export type ReferralSource = 'gapp-website' | 'hs-website';

/**
 * Legacy three-value status, kept in sync from `stage` on every write so any
 * older reader (and the CSV export's back-compat path) keeps working.
 */
export type ReferralStatus = 'new' | 'contacted' | 'archived';

/**
 * Pipeline stages for the referrals board, in board column order. This is the
 * source of truth for both the server (validation + activity log text) and the
 * client (column rendering), so the two can never drift.
 */
export type ReferralStage =
  | 'new'
  | 'contacted'
  | 'assessment'
  | 'authorization'
  | 'active'
  | 'closed';

export const REFERRAL_STAGES: ReferralStage[] = [
  'new',
  'contacted',
  'assessment',
  'authorization',
  'active',
  'closed',
];

export const STAGE_LABEL: Record<ReferralStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  assessment: 'Assessment',
  authorization: 'Authorization',
  active: 'Active',
  closed: 'Closed',
};

/** Map the legacy status onto a stage (for documents written before stages). */
export function stageFromStatus(status: string | undefined): ReferralStage {
  if (status === 'archived') return 'closed';
  if (status === 'contacted') return 'contacted';
  return 'new';
}

/** Derive a legacy status from a stage so old readers stay coherent. */
export function statusFromStage(stage: ReferralStage): ReferralStatus {
  if (stage === 'closed') return 'archived';
  if (stage === 'new') return 'new';
  return 'contacted';
}

/** An ordered label/value pair shown verbatim in the referral detail view. */
export interface ReferralDetail {
  label: string;
  value: string;
}

/** Kinds of entries that can appear on a referral's activity timeline. */
export type ReferralActivityType =
  | 'created'
  | 'stage_change'
  | 'assignment'
  | 'note'
  | 'contact'
  | 'share';

/** A single entry on a referral's activity timeline (timestamp ISO-serialized). */
export interface ReferralActivity {
  id: string;
  type: ReferralActivityType;
  text: string;
  byUid: string | null;
  byName: string;
  byRole: string | null;
  at: string | null;
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
  /** Pipeline stage — the board column this card sits in. */
  stage: ReferralStage;
  /** Legacy status, derived from stage. Retained for back-compat. */
  status: ReferralStatus;
  /** Sort position within a stage column (ascending). Newer cards sort first. */
  order: number;
  assigneeUid: string | null;
  assigneeName: string | null;
  /** Who last changed the stage/assignment (audit). Null on never-touched docs. */
  statusUpdatedBy: string | null;
  statusUpdatedByName: string | null;
  submittedAt: string | null;
  updatedAt: string | null;
}

// Upper bounds on stored text, so a single referral can never bloat a Firestore
// document or a notification email. Applied to every write, regardless of caller.
const MAX = {
  name: 200,
  email: 320,
  phone: 40,
  county: 100,
  program: 200,
  referrer: 200,
  detailLabel: 120,
  detailValue: 5000,
  activityText: 5000,
};

function clamp(value: string, max: number): string {
  const s = String(value ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeDetails(details: ReferralDetail[]): ReferralDetail[] {
  return (details || [])
    .filter((d) => d && d.value != null && String(d.value).trim() !== '')
    .map((d) => ({
      label: clamp(d.label, MAX.detailLabel),
      value: clamp(d.value, MAX.detailValue),
    }));
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

/** Convert a Firestore Timestamp (or null) to an ISO string for JSON. */
function toIso(ts: unknown): string | null {
  const t = ts as { toDate?: () => Date } | null | undefined;
  return t && typeof t.toDate === 'function' ? t.toDate().toISOString() : null;
}

/** Convert a Firestore Timestamp (or null) to epoch millis, or null. */
function toMillis(ts: unknown): number | null {
  const t = ts as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : null;
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
    stage: 'new' as ReferralStage,
    status: 'new' as ReferralStatus,
    // Negative creation time => newer referrals sort first in an ascending
    // board column, while still leaving room for fractional manual reordering.
    order: -Date.now(),
    assigneeUid: null as string | null,
    assigneeName: null as string | null,
    clientName: clamp(input.clientName, MAX.name),
    clientEmail: clamp(input.clientEmail, MAX.email),
    clientPhone: clamp(input.clientPhone, MAX.phone),
    county: clamp(input.county ?? '', MAX.county),
    program: clamp(input.program ?? '', MAX.program),
    referrerName: clamp(input.referrerName ?? '', MAX.referrer),
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
      await logCreated(ref.id);
      return { id: ref.id, deduped: false };
    } catch (err) {
      if (isAlreadyExists(err)) return { id: ref.id, deduped: true };
      throw err;
    }
  }

  // No externalId (e.g. the on-site marketing form): plain auto-id document.
  const ref = adminDb().collection(COLLECTION).doc();
  await ref.set(data);
  await logCreated(ref.id);
  return { id: ref.id, deduped: false };
}

/** Shape one Firestore doc into the UI Referral, deriving back-compat fields. */
function toReferral(id: string, data: FirebaseFirestore.DocumentData): Referral {
  const stage: ReferralStage = data.stage ?? stageFromStatus(data.status);
  const submittedMillis = toMillis(data.submittedAt) ?? toMillis(data.createdAt);
  const order =
    typeof data.order === 'number' ? data.order : -(submittedMillis ?? 0);
  return {
    id,
    source: data.source,
    externalId: data.externalId ?? undefined,
    stage,
    status: (data.status as ReferralStatus) ?? statusFromStage(stage),
    order,
    assigneeUid: data.assigneeUid ?? null,
    assigneeName: data.assigneeName ?? null,
    statusUpdatedBy: data.statusUpdatedBy ?? null,
    statusUpdatedByName: data.statusUpdatedByName ?? null,
    clientName: data.clientName ?? '',
    clientEmail: data.clientEmail ?? '',
    clientPhone: data.clientPhone ?? '',
    county: data.county ?? '',
    program: data.program ?? '',
    referrerName: data.referrerName ?? '',
    details: Array.isArray(data.details) ? data.details : [],
    submittedAt: toIso(data.submittedAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/** All referrals, newest first. */
export async function listReferrals(): Promise<Referral[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .orderBy('submittedAt', 'desc')
    .get();

  return snap.docs.map((d) => toReferral(d.id, d.data()));
}

/** A single referral, or null if it doesn't exist. */
export async function getReferral(id: string): Promise<Referral | null> {
  const snap = await adminDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return toReferral(snap.id, snap.data() as FirebaseFirestore.DocumentData);
}

// --- Activity timeline (subcollection: referrals/{id}/activity) ---

function serializeActivity(
  id: string,
  data: FirebaseFirestore.DocumentData
): ReferralActivity {
  return {
    id,
    type: (data.type as ReferralActivityType) ?? 'note',
    text: data.text ?? '',
    byUid: data.byUid ?? null,
    byName: data.byName ?? 'System',
    byRole: data.byRole ?? null,
    at: toIso(data.at),
  };
}

export interface ActivityWrite {
  type: ReferralActivityType;
  text: string;
  byUid?: string | null;
  byName?: string;
  byRole?: string | null;
}

/** Append an entry to a referral's activity timeline. Exported so sibling
 *  modules (e.g. agency sharing) can record to the same timeline. */
export async function logReferralActivity(referralId: string, entry: ActivityWrite): Promise<void> {
  await adminDb()
    .collection(COLLECTION)
    .doc(referralId)
    .collection('activity')
    .add({
      type: entry.type,
      text: clamp(entry.text, MAX.activityText),
      byUid: entry.byUid ?? null,
      byName: entry.byName ?? 'System',
      byRole: entry.byRole ?? null,
      at: FieldValue.serverTimestamp(),
    });
}

/** Best-effort "created" timeline entry; never blocks the intake write. */
async function logCreated(referralId: string): Promise<void> {
  try {
    await logReferralActivity(referralId, {
      type: 'created',
      text: 'Referral received',
      byName: 'System',
    });
  } catch (err) {
    console.error('Referral activity (created) log failed (non-fatal):', err);
  }
}

/** All timeline entries for a referral, newest first. */
export async function listReferralActivity(id: string): Promise<ReferralActivity[]> {
  const snap = await adminDb()
    .collection(COLLECTION)
    .doc(id)
    .collection('activity')
    .orderBy('at', 'desc')
    .get();
  return snap.docs.map((d) => serializeActivity(d.id, d.data()));
}

/** Add a manual note or contact-log entry, returning the created entry. */
export async function addReferralActivity(
  id: string,
  input: { type: 'note' | 'contact'; text: string },
  caller: AuthedCaller
): Promise<ReferralActivity | null> {
  if (input.type !== 'note' && input.type !== 'contact') {
    throw new Error('Invalid activity type.');
  }
  const text = clamp(input.text ?? '', MAX.activityText);
  if (!text.trim()) throw new Error('Note text is required.');

  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const docRef = await ref.collection('activity').add({
    type: input.type,
    text,
    byUid: caller.uid,
    byName: caller.profile.displayName || '',
    byRole: caller.role,
    at: FieldValue.serverTimestamp(),
  });
  await ref.update({ updatedAt: FieldValue.serverTimestamp() });

  const created = await docRef.get();
  return serializeActivity(created.id, created.data() as FirebaseFirestore.DocumentData);
}

// --- Mutations (board drag, assignment) ---

/**
 * Move a referral to a new stage and/or board position. A stage change is
 * recorded on the activity timeline; a pure reorder (position only) is not, to
 * keep the timeline signal-rich. Returns false if the referral is missing.
 */
export async function moveReferral(
  id: string,
  change: { stage?: ReferralStage; order?: number },
  caller: AuthedCaller
): Promise<boolean> {
  if (change.stage && !REFERRAL_STAGES.includes(change.stage)) {
    throw new Error('Invalid stage.');
  }
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const prev = snap.data() as FirebaseFirestore.DocumentData;
  const prevStage: ReferralStage = prev.stage ?? stageFromStatus(prev.status);

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: caller.uid,
    statusUpdatedByName: caller.profile.displayName || '',
  };
  if (typeof change.order === 'number' && Number.isFinite(change.order)) {
    update.order = change.order;
  }
  if (change.stage) {
    update.stage = change.stage;
    update.status = statusFromStage(change.stage);
  }
  await ref.update(update);

  if (change.stage && change.stage !== prevStage) {
    await logReferralActivity(id, {
      type: 'stage_change',
      text: `Moved from ${STAGE_LABEL[prevStage]} to ${STAGE_LABEL[change.stage]}`,
      byUid: caller.uid,
      byName: caller.profile.displayName || '',
      byRole: caller.role,
    });
  }
  return true;
}

/**
 * Hard-delete a referral, but first snapshot it (plus its activity timeline and
 * any share links) into `deletedReferrals/{id}` so the deletion is forensically
 * recoverable and audited — mirroring the progress-note deletion pattern. The
 * snapshot + deletes run as one batch so we never lose the audit trail. Admin
 * gates this at the route. Returns false if the referral is missing.
 */
export async function deleteReferral(id: string, caller: AuthedCaller): Promise<boolean> {
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const [activitySnap, sharesSnap] = await Promise.all([
    ref.collection('activity').get(),
    adminDb().collection('referralShares').where('referralId', '==', id).get(),
  ]);
  const activity = activitySnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const shares = sharesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const batch = adminDb().batch();
  batch.set(adminDb().collection('deletedReferrals').doc(id), {
    referral: snap.data() || {},
    activity,
    shares,
    originalId: id,
    deletedAt: FieldValue.serverTimestamp(),
    deletedBy: caller.uid,
    deletedByName: caller.profile.displayName || caller.email || '',
    deletedByRole: caller.role,
  });
  batch.delete(ref);
  for (const d of sharesSnap.docs) batch.delete(d.ref);
  await batch.commit();

  // Clean up the activity subcollection (not covered by the batch delete of the
  // parent). Best-effort: the snapshot already captured it.
  try {
    await adminDb().recursiveDelete(ref);
  } catch {
    /* ignore */
  }
  return true;
}

/** Assign (or, with null, unassign) a referral to a staff member. */
export async function assignReferral(
  id: string,
  assignee: { uid: string; name: string } | null,
  caller: AuthedCaller
): Promise<boolean> {
  const ref = adminDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;

  const prev = snap.data() as FirebaseFirestore.DocumentData;
  const prevUid: string | null = prev.assigneeUid ?? null;
  const nextUid = assignee?.uid ?? null;

  await ref.update({
    assigneeUid: nextUid,
    assigneeName: assignee?.name ?? null,
    updatedAt: FieldValue.serverTimestamp(),
    statusUpdatedBy: caller.uid,
    statusUpdatedByName: caller.profile.displayName || '',
  });

  if (prevUid !== nextUid) {
    await logReferralActivity(id, {
      type: 'assignment',
      text: assignee ? `Assigned to ${assignee.name.trim() || 'a team member'}` : 'Unassigned',
      byUid: caller.uid,
      byName: caller.profile.displayName || '',
      byRole: caller.role,
    });
  }
  return true;
}
