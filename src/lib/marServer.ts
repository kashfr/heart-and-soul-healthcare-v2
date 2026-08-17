import 'server-only';
import { FieldValue, type DocumentData, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { buildMarAdminFields, deriveInitials, parseValueOptions, regimenFieldsChanged } from './marShared';

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

interface ProposedMedShape {
  medName?: string;
  dose?: string;
  units?: string;
  route?: string;
  frequencyLabel?: string;
  scheduledTimes?: string[];
  isPRN?: boolean;
  indication?: string;
  valueLabel?: string;
  valueUnit?: string;
  valueOptions?: string[] | string;
  startDate?: string;
  orderSignedDate?: string;
  orderingPhysician?: string;
  physicianPending?: boolean;
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
    valueLabel: String(p.valueLabel || ''),
    valueUnit: String(p.valueUnit || ''),
    valueOptions: parseValueOptions(p.valueOptions),
    startDate,
    endDate: null,
    orderSignedDate: String(p.orderSignedDate || ''),
    orderingPhysician: String(p.orderingPhysician || ''),
    physicianPending: p.physicianPending === true,
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
 * The documentation half of an order: who ordered it, why, and how it reads —
 * everything a "change" may rewrite WITHOUT starting a new regimen. Used both
 * to apply a correction and (run over the pre-change order) to snapshot what it
 * replaced, so the change history records what the order said before the edit.
 */
function correctionFields(p: ProposedMedShape) {
  return {
    indication: String(p.indication || ''),
    notes: String(p.notes || ''),
    orderingPhysician: String(p.orderingPhysician || ''),
    orderSignedDate: String(p.orderSignedDate || ''),
    physicianPending: p.physicianPending === true,
    valueOptions: parseValueOptions(p.valueOptions),
  };
}

/**
 * Apply ONE medication change in a single atomic batch and stamp its change
 * request applied. There is no approval gate and no acknowledgment step:
 * keeping the MAR current per a physician's order is within an LPN's scope.
 * The record persists as the audit trail of what changed and who did it.
 * Shared by the note flow (applyStagedChanges) and the
 * standalone MAR (applyStandaloneChange) so both behave identically:
 *   - add: create a new active order.
 *   - change: if the edit moves a REGIMEN field (dose, route, frequency,
 *     times, PRN, measurement), discontinue the target on the effective date
 *     and create its replacement, linked via supersedes / supersededBy. If it
 *     only rewrites documentation (ordering physician, signed date, indication,
 *     notes, allowed readings), update the order IN PLACE — no discontinue and
 *     no second MAR row.
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
  const reviewStamp = { status: 'applied', appliedAt: FieldValue.serverTimestamp() };
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
    const p = (data.proposedMed || {}) as ProposedMedShape;

    // Does this edit change HOW the med is given, or only who ordered it and
    // why? Re-derived here rather than trusted from the client, so a crafted
    // payload can't turn a dose change into a silent in-place edit.
    const regimenChanges = regimenFieldsChanged(old, {
      medName: p.medName,
      dose: p.dose,
      units: p.units,
      route: p.route,
      frequencyLabel: p.frequencyLabel,
      scheduledTimes: p.scheduledTimes,
      isPRN: p.isPRN,
      valueLabel: p.valueLabel,
      valueUnit: p.valueUnit,
    });

    if (regimenChanges.length === 0) {
      // CORRECTION: nothing about the administration changed, so the order is
      // updated in place. No discontinue, no replacement, one unbroken MAR row
      // — a med whose ordering physician was finally filled in must not read as
      // though it was stopped.
      batch.update(oldRef, {
        ...correctionFields(p),
        lastEditedAt: FieldValue.serverTimestamp(),
        lastEditedBy: caller.uid,
        lastEditedByName: caller.profile.displayName || '',
      });
      batch.update(reqRef, {
        ...reviewStamp,
        changeKind: 'correction',
        updatedOrderId: oldId,
        // Exactly the fields the correction overwrote, so the change history
        // shows what the order said before the edit.
        previousValues: correctionFields(old as ProposedMedShape),
      });
    } else {
      // REGIMEN CHANGE: the terms of administration moved, so the old order is
      // discontinued and a replacement starts on the effective date. Each
      // charted dose stays tied to the regimen it was given under.
      const effective = isoOr(data.effectiveDate, today);
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
      batch.update(reqRef, {
        ...reviewStamp,
        changeKind: 'regimen',
        regimenFieldsChanged: regimenChanges,
        createdOrderId: newRef.id,
      });
    }
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
 * gate and no acknowledgment step: maintaining the MAR per physician orders is
 * within the nurse's scope, so each change simply takes effect and is recorded.
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
// Standalone MAR med management. Same scope model as the note flow
// (add/change/discontinue is within an RN/LPN's scope; a supervisor may also do
// it; nothing waits for approval), but made straight from the MAR grid with no
// progress note. The change applies immediately and is recorded for audit —
// nothing waits on a reviewer. All writes go through the Admin SDK, so the staff-only
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
    valueLabel: String(p.valueLabel || '').trim(),
    valueUnit: String(p.valueUnit || '').trim(),
    valueOptions: parseValueOptions(p.valueOptions),
    startDate: String(p.startDate || ''),
    orderSignedDate: String(p.orderSignedDate || '').trim(),
    orderingPhysician: String(p.orderingPhysician || '').trim(),
    physicianPending: p.physicianPending === true,
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
  | 'missing-reason'
  | 'voided';

export interface AmendResult {
  ok: boolean;
  id?: string; // the new (superseding) record's id
  reason?: AmendFailureReason;
  message?: string;
}

const AMENDABLE_STATUS = new Set(['given', 'held', 'refused']);

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
  input: { status: string; actualTime?: string; reason?: string; outcome?: string; prescriberNotified?: boolean; amendmentReason: string },
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
  // PRN-ness must survive the rebuild or buildMarAdminFields blanks the dose's
  // why-given reason and outcome. New docs persist isPRN; 'unscheduled' one-offs
  // (including legacy docs from before isPRN was stored) are treated as PRN-ish
  // so a correction never strips what Page 5 required the nurse to record.
  const isPRN = scheduledTime === 'PRN' || scheduledTime === 'unscheduled' || orig.isPRN === true;
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
      initials: deriveInitials(amenderName),
      reason: String(input.reason || ''),
      // A correction carries the outcome forward unless the amender edits it,
      // so amending a dose's time can never silently drop its recorded result.
      outcome: input.outcome !== undefined ? String(input.outcome) : String(orig.outcome || ''),
      // Same carry-forward for the prescriber-notified attestation (D.4.d):
      // an amendment can ADD it (nurse reached the doctor after documenting)
      // but never silently drops it.
      prescriberNotified:
        input.prescriberNotified !== undefined
          ? input.prescriberNotified === true
          : orig.prescriberNotified === true,
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

  // Write the superseding record inside a transaction that re-checks (1) nothing
  // already amends this entry — two concurrent corrections can't fork the chain —
  // and (2) the ORIGINAL doc's CURRENT outcome. The outcome can be completed via
  // /api/mar/outcome while an amend form sits open, so the pre-transaction read
  // above may be stale; carrying outcome from the fresh in-transaction read means
  // an overlapping correction can never silently drop a just-recorded result.
  const newRef = col.doc();
  const failure = await adminDb().runTransaction(async (tx): Promise<AmendFailureReason | null> => {
    const [fresh, existing] = await Promise.all([
      tx.get(col.doc(adminId)),
      tx.get(col.where('amends', '==', adminId).limit(1)),
    ]);
    if (!fresh.exists) return 'not-found';
    if (!existing.empty) return 'superseded';
    if ((fresh.data() || {}).voided === true) return 'voided';

    const freshData = fresh.data() || {};
    const freshOutcome = String(freshData.outcome || '').trim();
    const sentOutcome = input.outcome !== undefined ? String(input.outcome).trim() : undefined;
    // Effective outcome: an explicit non-empty edit wins; otherwise keep the
    // freshest stored value. A stale EMPTY submission never erases a recorded
    // result (erasing isn't a supported flow — a wrong result gets amended to a
    // corrected one, not to nothing).
    const effective = sentOutcome ? sentOutcome : freshOutcome;
    const kept = base.status === 'given' && isPRN ? effective : '';

    // Attribution: unchanged text keeps the original recorder's stamp; new or
    // edited text is attributed to the amender.
    const attribution = !kept
      ? { outcomeBy: '', outcomeByName: '', outcomeAt: null }
      : kept === freshOutcome
        ? {
            outcomeBy: String(freshData.outcomeBy || ''),
            outcomeByName: String(freshData.outcomeByName || ''),
            outcomeAt: freshData.outcomeAt ?? null,
          }
        : { outcomeBy: caller.uid, outcomeByName: amenderName, outcomeAt: FieldValue.serverTimestamp() };

    tx.set(newRef, {
      ...base,
      outcome: kept,
      ...attribution,
      amends: adminId,
      amendmentReason,
      at: FieldValue.serverTimestamp(),
    });
    return null;
  });
  if (failure === 'not-found') {
    return { ok: false, reason: 'not-found', message: 'That administration was not found.' };
  }
  if (failure === 'superseded') {
    return {
      ok: false,
      reason: 'superseded',
      message: 'This entry was already amended. Refresh and amend the current entry.',
    };
  }
  if (failure === 'voided') {
    return {
      ok: false,
      reason: 'voided',
      message: 'This entry was removed as entered in error and can no longer be amended.',
    };
  }
  return { ok: true, id: newRef.id };
}

// ---------------------------------------------------------------------------
// Entered-in-error void. An amendment corrects WHAT a dose entry says; a void
// says the entry should never have existed at all (mis-clicked slot or day,
// wrong client, a shift she didn't work). This is the nurse's own undo — the
// documenting nurse may void her entry, and an RN/supervisor/admin may void
// anyone's. The doc keeps a who/when/why stamp for the audit trail, every
// live view drops it via
// resolveCurrentAdministrations, and the slot reopens for correct charting.
// Admin SDK only — the client-side update rule on marAdministrations stays
// `false`, so this is the ONLY mutation path besides the write-once outcome.
// ---------------------------------------------------------------------------

export type VoidFailureReason = 'not-found' | 'forbidden' | 'superseded' | 'already-voided' | 'missing-reason';

export interface VoidResult {
  ok: boolean;
  reason?: VoidFailureReason;
  message?: string;
}

/**
 * Mark an administration entry as entered in error. Permission mirrors the
 * amend flow — the documenting nurse may remove her own entry (real-time
 * self-correction of a mis-click), and an RN / supervisor / admin may remove
 * any — with a required reason. Must target the CURRENT head of an amend
 * chain; voiding it removes the whole logical dose (predecessors stay
 * superseded, so nothing resurrects).
 */
export async function voidMarAdministration(
  adminId: string,
  input: { voidReason: string },
  caller: AuthedCaller,
): Promise<VoidResult> {
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
      message: 'Only the documenting nurse or an RN, supervisor, or admin can remove this entry.',
    };
  }

  const voidReason = String(input.voidReason || '').trim();
  if (!voidReason) {
    return { ok: false, reason: 'missing-reason', message: 'A reason is required to remove an entry.' };
  }

  const callerName = caller.profile.displayName || caller.email || '';
  const failure = await adminDb().runTransaction(async (tx): Promise<VoidFailureReason | null> => {
    const [fresh, successor] = await Promise.all([
      tx.get(col.doc(adminId)),
      tx.get(col.where('amends', '==', adminId).limit(1)),
    ]);
    if (!fresh.exists) return 'not-found';
    const data = fresh.data() || {};
    if (data.voided === true) return 'already-voided';
    // A superseded entry is already not the record; removing it would leave the
    // superseding correction standing on a voided base. Void the current entry.
    if (!successor.empty) return 'superseded';
    tx.update(col.doc(adminId), {
      voided: true,
      voidedAt: FieldValue.serverTimestamp(),
      voidedBy: caller.uid,
      voidedByName: callerName,
      voidReason,
    });
    return null;
  });

  if (failure === 'not-found') {
    return { ok: false, reason: 'not-found', message: 'That administration was not found.' };
  }
  if (failure === 'already-voided') {
    return { ok: false, reason: 'already-voided', message: 'This entry was already removed.' };
  }
  if (failure === 'superseded') {
    return {
      ok: false,
      reason: 'superseded',
      message: 'This entry was corrected by a newer one. Refresh and remove the current entry.',
    };
  }
  return { ok: true };
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
  | 'missing-outcome'
  | 'voided';

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
    // Same guard the amend transaction has: a dose removed as entered-in-error
    // is audit history — a result must not be stamped onto it (the form could
    // be sitting open while an RN voids the dose concurrently).
    if ((fresh.data() || {}).voided === true) return 'voided';
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

  if (failure === 'voided') {
    return {
      ok: false,
      reason: 'voided',
      message: 'This entry was removed as entered in error; there is nothing to record a result on.',
    };
  }
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

