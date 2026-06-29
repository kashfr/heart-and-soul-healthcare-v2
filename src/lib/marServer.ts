import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { buildMarAdminFields } from './marShared';

export interface ApplyChangesResult {
  ok: true;
  applied: number;
  failed: number;
}

export type ReviewFailureReason = 'not-found' | 'already-reviewed';

export interface ReviewResult {
  ok: boolean;
  reqId: string;
  reason?: ReviewFailureReason;
  message?: string;
}

interface ProposedMedShape {
  medName?: string;
  dose?: string;
  units?: string;
  route?: string;
  frequencyLabel?: string;
  scheduledTimes?: string[];
  isPRN?: boolean;
  indication?: string;
  startDate?: string;
  orderingPhysician?: string;
  notes?: string;
}

function orderFromProposed(
  patientId: string,
  p: ProposedMedShape,
  startDate: string,
  caller: AuthedCaller,
  extra: Record<string, unknown> = {},
) {
  return {
    patientId,
    medName: String(p.medName || ''),
    dose: String(p.dose || ''),
    units: String(p.units || ''),
    route: String(p.route || ''),
    frequencyLabel: String(p.frequencyLabel || ''),
    scheduledTimes: p.isPRN ? [] : Array.isArray(p.scheduledTimes) ? p.scheduledTimes : [],
    isPRN: !!p.isPRN,
    indication: String(p.indication || ''),
    startDate,
    endDate: null,
    orderingPhysician: String(p.orderingPhysician || ''),
    notes: String(p.notes || ''),
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    createdBy: caller.uid,
    createdByName: caller.profile.displayName || '',
    createdByRole: caller.role,
    ...extra,
  };
}

/**
 * Apply every change still STAGED on a note, in one batch. Called from the
 * apply-changes route when the nurse submits her note. There is NO approval
 * gate: maintaining the MAR per physician orders is within the nurse's scope,
 * so each change takes effect and is flagged reviewStatus 'pending' for the RN
 * to acknowledge afterward.
 *
 *  - add: create a new active order.
 *  - change: discontinue the old order (effective date) AND create a new order
 *    with the changed values, linked via supersedes / supersededBy, so the MAR
 *    keeps a clean per-regimen history.
 *  - discontinue: stop the target order effective the given date.
 *
 * `today` (YYYY-MM-DD) is the fallback effective/start date when none was set.
 */
export async function applyStagedChanges(
  sourceNoteId: string,
  caller: AuthedCaller,
  today: string,
): Promise<ApplyChangesResult> {
  const snap = await adminDb()
    .collection('marChangeRequests')
    .where('sourceNoteId', '==', sourceNoteId)
    .get();

  const staged = snap.docs.filter((d) => (d.data() || {}).status === 'staged');
  let applied = 0;
  let failed = 0;

  for (const d of staged) {
    const data = d.data() || {};
    const reqRef = d.ref;
    const reviewStamp = { status: 'applied', reviewStatus: 'pending', appliedAt: FieldValue.serverTimestamp() };
    try {
      const batch = adminDb().batch();
      const patientId = String(data.patientId || '');

      if (data.type === 'add') {
        const orderRef = adminDb().collection('marOrders').doc();
        const p = (data.proposedMed || {}) as ProposedMedShape;
        batch.set(
          orderRef,
          orderFromProposed(patientId, p, String(p.startDate || today), caller, { fromChangeRequestId: reqRef.id }),
        );
        batch.update(reqRef, { ...reviewStamp, createdOrderId: orderRef.id });
      } else if (data.type === 'change') {
        const oldId = String(data.targetOrderId || '');
        const oldRef = adminDb().collection('marOrders').doc(oldId);
        const oldSnap = await oldRef.get();
        if (!oldId || !oldSnap.exists) {
          failed += 1;
          continue;
        }
        const effective = String(data.effectiveDate || today);
        const p = (data.proposedMed || {}) as ProposedMedShape;
        const newRef = adminDb().collection('marOrders').doc();
        batch.set(
          newRef,
          orderFromProposed(patientId, p, String(p.startDate || effective), caller, {
            fromChangeRequestId: reqRef.id,
            supersedesOrderId: oldId,
          }),
        );
        batch.update(oldRef, {
          status: 'discontinued',
          endDate: effective,
          discontinuedAt: FieldValue.serverTimestamp(),
          discontinuedBy: caller.uid,
          discontinuedByName: caller.profile.displayName || '',
          discontinueReason: `Changed per physician order: ${String(data.reason || '').trim()}`.trim(),
          supersededByOrderId: newRef.id,
        });
        batch.update(reqRef, { ...reviewStamp, createdOrderId: newRef.id });
      } else if (data.type === 'discontinue') {
        const orderId = String(data.targetOrderId || '');
        const orderRef = adminDb().collection('marOrders').doc(orderId);
        const orderSnap = await orderRef.get();
        if (!orderId || !orderSnap.exists) {
          failed += 1;
          continue;
        }
        batch.update(orderRef, {
          status: 'discontinued',
          endDate: String(data.effectiveDate || today),
          discontinuedAt: FieldValue.serverTimestamp(),
          discontinuedBy: caller.uid,
          discontinuedByName: caller.profile.displayName || '',
          discontinueReason: String(data.reason || '').trim(),
        });
        batch.update(reqRef, reviewStamp);
      } else {
        failed += 1;
        continue;
      }

      await batch.commit();
      applied += 1;
    } catch (err) {
      console.error('Failed to apply staged MAR change', reqRef.id, err);
      failed += 1;
    }
  }

  return { ok: true, applied, failed };
}

// ---------------------------------------------------------------------------
// Amend an administration. Append-only: a correction is a NEW administration doc
// that supersedes the original via `amends`. The original is never edited (the
// collection's update/delete rule is `if false`). The amender signs the new doc.
// ---------------------------------------------------------------------------

export type AmendFailureReason =
  | 'not-found'
  | 'forbidden'
  | 'superseded'
  | 'bad-status'
  | 'missing-reason';

export interface AmendResult {
  ok: boolean;
  id?: string; // the new (superseding) record's id
  reason?: AmendFailureReason;
  message?: string;
}

const AMENDABLE_STATUS = new Set(['given', 'held', 'refused']);

function initialsFrom(name: string): string {
  return (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase())
    .slice(0, 3)
    .join('');
}

/**
 * Record a correction to an existing administration. Writes a superseding doc
 * (status/actualTime/reason from the caller, identity = the amender, `amends` =
 * the original id, `amendmentReason` = why). Reuses buildMarAdminFields so the
 * same status rules apply (actualTime kept only for given; reason kept for
 * held/refused and PRN-given). Permission: the documenting nurse may amend her
 * own entry; an RN / supervisor / admin may amend any.
 */
export async function amendMarAdministration(
  adminId: string,
  input: { status: string; actualTime?: string; reason?: string; amendmentReason: string },
  caller: AuthedCaller,
): Promise<AmendResult> {
  const col = adminDb().collection('marAdministrations');
  const origSnap = await col.doc(adminId).get();
  if (!origSnap.exists) {
    return { ok: false, reason: 'not-found', message: 'That administration was not found.' };
  }
  const orig = origSnap.data() || {};

  const isReviewer =
    caller.role === 'admin' || caller.role === 'supervisor' || caller.profile.credential === 'RN';
  const isOwner = String(orig.documentedBy || '') === caller.uid;
  if (!isReviewer && !isOwner) {
    return {
      ok: false,
      reason: 'forbidden',
      message: 'Only the documenting nurse or an RN, supervisor, or admin can amend this entry.',
    };
  }

  const status = String(input.status || '');
  if (!AMENDABLE_STATUS.has(status)) {
    return { ok: false, reason: 'bad-status', message: 'Status must be given, held, or refused.' };
  }
  const amendmentReason = String(input.amendmentReason || '').trim();
  if (!amendmentReason) {
    return { ok: false, reason: 'missing-reason', message: 'A reason for the correction is required.' };
  }

  const scheduledTime = String(orig.scheduledTime || '');
  const isPRN = scheduledTime === 'PRN';
  const amenderName = caller.profile.displayName || caller.email || '';
  const givenStatus = status === 'given';
  const base = buildMarAdminFields(
    {
      orderId: String(orig.orderId || ''),
      medName: String(orig.medNameSnapshot || ''),
      dose: String(orig.doseSnapshot || ''),
      units: String(orig.unitsSnapshot || ''),
      route: String(orig.routeSnapshot || ''),
      scheduledTime,
      status: status as 'given' | 'held' | 'refused',
      // Keep who physically gave it only when the corrected status is "given".
      administeredByType: givenStatus ? String(orig.administeredByType || 'nurse') : 'nurse',
      administratorName: givenStatus ? String(orig.administratorName || '') : '',
      actualTime: String(input.actualTime || ''),
      initials: initialsFrom(amenderName),
      reason: String(input.reason || ''),
      isPRN,
      indication: String(orig.indicationSnapshot || ''),
    },
    {
      patientId: String(orig.patientId || ''),
      date: String(orig.date || ''),
      sourceNoteId: String(orig.sourceNoteId || ''),
      documenter: { uid: caller.uid, name: amenderName, credential: caller.profile.credential || caller.role },
    },
  );

  // Write the superseding record inside a transaction whose read re-checks that
  // nothing already amends this entry, so two concurrent corrections of the same
  // dose can't both commit and fork the chain into two "current" records.
  const newRef = col.doc();
  const conflict = await adminDb().runTransaction(async (tx) => {
    const existing = await tx.get(col.where('amends', '==', adminId).limit(1));
    if (!existing.empty) return true;
    tx.set(newRef, { ...base, amends: adminId, amendmentReason, at: FieldValue.serverTimestamp() });
    return false;
  });
  if (conflict) {
    return {
      ok: false,
      reason: 'superseded',
      message: 'This entry was already amended. Refresh and amend the current entry.',
    };
  }
  return { ok: true, id: newRef.id };
}

/** Mark an applied change as reviewed (RN acknowledgment; no approval). */
export async function acknowledgeReview(reqId: string, caller: AuthedCaller): Promise<ReviewResult> {
  const ref = adminDb().collection('marChangeRequests').doc(reqId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reqId, reason: 'not-found', message: 'Change not found.' };
  const data = snap.data() || {};
  if (data.reviewStatus !== 'pending') {
    return { ok: false, reqId, reason: 'already-reviewed', message: 'This change has already been reviewed.' };
  }
  await ref.update({
    reviewStatus: 'reviewed',
    reviewedBy: caller.uid,
    reviewedByName: caller.profile.displayName || '',
    reviewedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true, reqId };
}
