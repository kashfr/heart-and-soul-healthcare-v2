import 'server-only';
import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { buildMarAdminFields } from './marShared';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Return `value` if it is an ISO YYYY-MM-DD date string, else `fallback`. Both
 *  the note flow and the standalone flow route their dates through here (via
 *  applyChangeInBatch), so a crafted change request can't store a garbage date
 *  on a real order and silently mis-schedule a med (dates are compared as raw
 *  strings by orderAppliesOn / orderOverlapsRange). */
function isoOr(value: unknown, fallback: string): string {
  const s = String(value || '');
  return ISO_DATE_RE.test(s) ? s : fallback;
}

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
 * Apply ONE medication change in a single atomic batch and stamp its change
 * request applied + reviewStatus 'pending' (RN acknowledgment; there is NO
 * approval gate). Shared by the note flow (applyStagedChanges) and the
 * standalone MAR (applyStandaloneChange) so both behave identically:
 *   - add: create a new active order.
 *   - change: discontinue the target (effective date) AND create the new order,
 *     linked via supersedes / supersededBy.
 *   - discontinue: stop the target effective the given date.
 * Adding OR changing a med also trips `patient.requiresMar = true`, so the MAR
 * becomes visible to everyone the instant a med exists — whichever surface (or
 * role) created it.
 *
 * Returns false (caller counts it "failed" and leaves the request un-applied)
 * when the change can't be applied: unknown type, or a change/discontinue whose
 * target order is missing OR belongs to a different patient (a guard so a
 * client can't act on another client's order by id).
 */
async function applyChangeInBatch(
  reqRef: DocumentReference,
  data: DocumentData,
  caller: AuthedCaller,
  today: string,
): Promise<boolean> {
  const reviewStamp = { status: 'applied', reviewStatus: 'pending', appliedAt: FieldValue.serverTimestamp() };
  const patientId = String(data.patientId || '');
  const patientRef = patientId ? adminDb().collection('patients').doc(patientId) : null;
  const batch = adminDb().batch();

  if (data.type === 'add') {
    const orderRef = adminDb().collection('marOrders').doc();
    const p = (data.proposedMed || {}) as ProposedMedShape;
    batch.set(
      orderRef,
      orderFromProposed(patientId, p, isoOr(p.startDate, today), caller, { fromChangeRequestId: reqRef.id }),
    );
    if (patientRef) batch.set(patientRef, { requiresMar: true }, { merge: true });
    batch.update(reqRef, { ...reviewStamp, createdOrderId: orderRef.id });
  } else if (data.type === 'change') {
    const oldId = String(data.targetOrderId || '');
    if (!oldId) return false;
    const oldRef = adminDb().collection('marOrders').doc(oldId);
    const oldSnap = await oldRef.get();
    const old = oldSnap.data() || {};
    // Must exist, belong to THIS patient, and still be active — changing a
    // discontinued order would resurrect a stopped med.
    if (!oldSnap.exists || String(old.patientId || '') !== patientId || String(old.status || '') !== 'active') {
      return false;
    }
    const effective = isoOr(data.effectiveDate, today);
    const p = (data.proposedMed || {}) as ProposedMedShape;
    const newRef = adminDb().collection('marOrders').doc();
    // The new order starts the day the old one ends (the change's effective
    // date), so the regimens hand off cleanly with no overlap or gap.
    batch.set(
      newRef,
      orderFromProposed(patientId, p, effective, caller, {
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
    if (patientRef) batch.set(patientRef, { requiresMar: true }, { merge: true });
    batch.update(reqRef, { ...reviewStamp, createdOrderId: newRef.id });
  } else if (data.type === 'discontinue') {
    const orderId = String(data.targetOrderId || '');
    if (!orderId) return false;
    const orderRef = adminDb().collection('marOrders').doc(orderId);
    const orderSnap = await orderRef.get();
    const ord = orderSnap.data() || {};
    // Must exist, belong to THIS patient, and still be active — no re-stopping an
    // already-discontinued order.
    if (!orderSnap.exists || String(ord.patientId || '') !== patientId || String(ord.status || '') !== 'active') {
      return false;
    }
    batch.update(orderRef, {
      status: 'discontinued',
      endDate: isoOr(data.effectiveDate, today),
      discontinuedAt: FieldValue.serverTimestamp(),
      discontinuedBy: caller.uid,
      discontinuedByName: caller.profile.displayName || '',
      discontinueReason: String(data.reason || '').trim(),
    });
    batch.update(reqRef, reviewStamp);
  } else {
    return false;
  }

  await batch.commit();
  return true;
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
    try {
      const ok = await applyChangeInBatch(d.ref, d.data() || {}, caller, today);
      if (ok) applied += 1;
      else failed += 1;
    } catch (err) {
      console.error('Failed to apply staged MAR change', d.ref.id, err);
      failed += 1;
    }
  }

  return { ok: true, applied, failed };
}

// ---------------------------------------------------------------------------
// Standalone MAR med management. Same scope + acknowledgment model as the note
// flow (add/change/discontinue is within an RN/LPN's scope; a supervisor may
// also do it; nothing waits for approval), but made straight from the MAR grid
// with no progress note. The change is applied immediately and recorded for the
// RN to acknowledge afterward (reviewStatus 'pending' → shows in the existing
// pending-review queue). All writes go through the Admin SDK, so the staff-only
// marOrders/patients create-update rules and the note-required marChangeRequests
// create rule don't apply here.
// ---------------------------------------------------------------------------

export interface StandaloneChangeInput {
  patientId: string;
  patientName: string;
  type: 'add' | 'change' | 'discontinue';
  proposedMed?: ProposedMedShape;
  targetOrderId?: string;
  targetMedName?: string;
  effectiveDate?: string;
  reason: string;
  clientRequestId?: string; // stable per-submission id for idempotency
}

export type StandaloneChangeFailure = 'apply-failed' | 'error' | 'duplicate';

export interface StandaloneChangeResult {
  ok: boolean;
  reqId?: string;
  createdOrderId?: string;
  reason?: StandaloneChangeFailure;
  message?: string;
}

/** Coerce a client-supplied proposed med to a clean, undefined-free shape for
 *  storage on the change-request doc (Firestore rejects undefined). The ORDER
 *  itself is still built by orderFromProposed, which coerces independently. */
function cleanProposed(p: ProposedMedShape) {
  return {
    medName: String(p.medName || '').trim(),
    dose: String(p.dose || '').trim(),
    units: String(p.units || '').trim(),
    route: String(p.route || '').trim(),
    frequencyLabel: String(p.frequencyLabel || '').trim(),
    scheduledTimes: p.isPRN ? [] : Array.isArray(p.scheduledTimes) ? p.scheduledTimes.filter(Boolean) : [],
    isPRN: !!p.isPRN,
    indication: String(p.indication || '').trim(),
    startDate: String(p.startDate || ''),
    orderingPhysician: String(p.orderingPhysician || '').trim(),
    notes: String(p.notes || '').trim(),
  };
}

export async function applyStandaloneChange(
  input: StandaloneChangeInput,
  caller: AuthedCaller,
  today: string,
): Promise<StandaloneChangeResult> {
  const col = adminDb().collection('marChangeRequests');
  // Idempotency: when the client supplies a stable per-submission id, key the
  // request doc on it and create it transactionally, so a double-click or a
  // network retry can't mint two orders. Falls back to an auto id otherwise.
  const reqRef = input.clientRequestId ? col.doc(input.clientRequestId) : col.doc();
  const payload: Record<string, unknown> = {
    patientId: input.patientId,
    patientName: String(input.patientName || ''),
    type: input.type,
    reason: String(input.reason || '').trim(),
    doseRecorded: false,
    sourceNoteId: '', // standalone: not tied to a progress note
    source: 'standalone-mar',
    status: 'staged', // flipped to 'applied' by applyChangeInBatch
    performedBy: caller.uid,
    performedByName: caller.profile.displayName || '',
    performedByCredential: caller.profile.credential || caller.role,
    stagedAt: FieldValue.serverTimestamp(),
  };
  if ((input.type === 'add' || input.type === 'change') && input.proposedMed) {
    payload.proposedMed = cleanProposed(input.proposedMed);
  }
  if (input.type === 'change' || input.type === 'discontinue') {
    payload.targetOrderId = input.targetOrderId || '';
    payload.targetMedName = input.targetMedName || '';
    payload.effectiveDate = input.effectiveDate || '';
  }

  const created = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (snap.exists) return false;
    tx.set(reqRef, payload);
    return true;
  });
  if (!created) {
    return { ok: false, reason: 'duplicate', message: 'This change was already submitted.' };
  }
  try {
    const ok = await applyChangeInBatch(reqRef, { ...payload }, caller, today);
    if (!ok) {
      // Nothing was written (bad target / unknown type). Drop the staged stub so
      // it doesn't dangle as an un-applied, note-less record.
      await reqRef.delete().catch(() => {});
      return {
        ok: false,
        reason: 'apply-failed',
        message: 'Could not apply the change — the medication may no longer exist on this client.',
      };
    }
  } catch (err) {
    console.error('applyStandaloneChange failed', reqRef.id, err);
    // The batch may have COMMITTED server-side even though we saw an error (a
    // lost ack). Only clean up if nothing was applied; if the order was created,
    // treat it as success so we never orphan a live med with no review record.
    const after = await reqRef.get().catch(() => null);
    const applied = after && after.exists ? after.data() || {} : null;
    if (applied && applied.status === 'applied') {
      return { ok: true, reqId: reqRef.id, createdOrderId: String(applied.createdOrderId || '') };
    }
    await reqRef.delete().catch(() => {});
    return { ok: false, reason: 'error', message: 'Failed to apply the change. Please try again.' };
  }
  const fresh = await reqRef.get();
  return { ok: true, reqId: reqRef.id, createdOrderId: String((fresh.data() || {}).createdOrderId || '') };
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
  input: { status: string; actualTime?: string; reason?: string; outcome?: string; amendmentReason: string },
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
      // A correction carries the outcome forward unless the amender edits it,
      // so amending a dose's time can never silently drop its recorded result.
      outcome: input.outcome !== undefined ? String(input.outcome) : String(orig.outcome || ''),
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

// ---------------------------------------------------------------------------
// PRN outcome (effectiveness follow-up). A given PRN dose is complete only when
// the result is documented — why given -> given -> what happened. The result is
// often observed 30-60 minutes after the dose, so grid-charted doses record it
// AFTER the fact via this write-once completion: it fills the empty `outcome`
// on the ORIGINAL doc (with outcomeBy/At stamps) rather than superseding it,
// because nothing is being corrected. Once set, changes go through the amend
// flow like any other correction. Admin SDK only — the client update rule
// stays `false`.
// ---------------------------------------------------------------------------

export type OutcomeFailureReason =
  | 'not-found'
  | 'forbidden'
  | 'bad-status'
  | 'superseded'
  | 'already-recorded'
  | 'missing-outcome';

export interface OutcomeResult {
  ok: boolean;
  reason?: OutcomeFailureReason;
  message?: string;
}

/**
 * Record the result of a given PRN dose. Permission mirrors the amend flow: the
 * documenting nurse may complete her own entry; an RN / supervisor / admin may
 * complete any. Write-once: fails with 'already-recorded' when an outcome
 * already exists (use the amend flow to change one).
 */
export async function recordPrnOutcome(
  adminId: string,
  outcomeInput: string,
  caller: AuthedCaller,
): Promise<OutcomeResult> {
  const outcome = String(outcomeInput || '').trim();
  if (!outcome) {
    return { ok: false, reason: 'missing-outcome', message: 'Describe the result of the dose.' };
  }

  const col = adminDb().collection('marAdministrations');
  const ref = col.doc(adminId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, reason: 'not-found', message: 'That administration was not found.' };
  }
  const orig = snap.data() || {};

  const isReviewer =
    caller.role === 'admin' || caller.role === 'supervisor' || caller.profile.credential === 'RN';
  const isOwner = String(orig.documentedBy || '') === caller.uid;
  if (!isReviewer && !isOwner) {
    return {
      ok: false,
      reason: 'forbidden',
      message: 'Only the documenting nurse or an RN, supervisor, or admin can record the result.',
    };
  }

  if (orig.status !== 'given' || String(orig.scheduledTime || '') !== 'PRN') {
    return { ok: false, reason: 'bad-status', message: 'Results are recorded on given PRN doses.' };
  }

  // Transactional re-checks: still un-amended and still without an outcome, so a
  // concurrent amend or a double-submit can't produce two competing results.
  const failure = await adminDb().runTransaction(async (tx): Promise<OutcomeFailureReason | null> => {
    const [fresh, amended] = await Promise.all([
      tx.get(ref),
      tx.get(col.where('amends', '==', adminId).limit(1)),
    ]);
    if (!fresh.exists) return 'not-found';
    if (!amended.empty) return 'superseded';
    if (String((fresh.data() || {}).outcome || '').trim()) return 'already-recorded';
    tx.update(ref, {
      outcome,
      outcomeBy: caller.uid,
      outcomeByName: caller.profile.displayName || caller.email || '',
      outcomeAt: FieldValue.serverTimestamp(),
    });
    return null;
  });

  if (failure === 'superseded') {
    return {
      ok: false,
      reason: 'superseded',
      message: 'This entry was amended. Record the result on the current entry.',
    };
  }
  if (failure === 'already-recorded') {
    return {
      ok: false,
      reason: 'already-recorded',
      message: 'A result is already recorded. Use the amend flow to change it.',
    };
  }
  if (failure === 'not-found') {
    return { ok: false, reason: 'not-found', message: 'That administration was not found.' };
  }
  return { ok: true };
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
