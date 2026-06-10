import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

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
