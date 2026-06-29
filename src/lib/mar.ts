import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildMarAdminFields } from './marShared';

/**
 * MAR standing medication orders. One doc per medication per client in the
 * top-level `marOrders` collection, linked by patientId (mirrors how
 * progressNotes link to patients). The order is the regimen built by an
 * admin/supervisor; nurses document administrations against it (Phase 3).
 *
 * Orders are never lossily mutated: a dose/schedule change is a DISCONTINUE
 * (status + endDate) plus a NEW order, so the historical regimen is preserved.
 * A month's MAR materializes from the orders active during that month plus that
 * month's administration entries, which is why standing orders "roll forward".
 */
export type MarOrderStatus = 'active' | 'discontinued';

export interface MarOrder {
  id?: string;
  patientId: string;
  medName: string;
  dose: string; // amount, e.g. "10" or "1.5"
  units: string; // e.g. "mg", "mL", "tablet(s)"
  route: string;
  frequencyLabel: string; // free text, e.g. "BID", "Every morning"
  scheduledTimes: string[]; // 'HH:MM' 24h slots; empty for PRN
  isPRN: boolean;
  // Structured "what is this for" (e.g. "Moderate pain", "Fever > 101"). Most
  // important for PRN orders, where the nurse documents WHY each dose was given
  // against this standing indication. Snapshotted onto each administration.
  indication?: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // null/undefined = ongoing
  orderingPhysician?: string;
  notes?: string;
  status: MarOrderStatus;
  createdAt?: unknown;
  createdBy?: string;
  createdByName?: string;
  createdByRole?: string;
  lastEditedAt?: unknown;
  lastEditedBy?: string;
  lastEditedByName?: string;
  discontinuedAt?: unknown;
  discontinuedBy?: string;
  discontinuedByName?: string;
  discontinueReason?: string;
}

// Who is performing the write (stamped onto the doc for the audit trail).
export interface MarActor {
  uid: string;
  displayName: string;
  role: string;
}

// The editable fields a staff member sets when creating or editing an order.
export interface MarOrderInput {
  medName: string;
  dose: string;
  units: string;
  route: string;
  frequencyLabel: string;
  scheduledTimes: string[];
  isPRN: boolean;
  indication?: string;
  startDate: string;
  endDate?: string | null;
  orderingPhysician?: string;
  notes?: string;
}

// PRN orders carry no scheduled times; normalize so the stored shape is
// consistent and free of undefined (Firestore rejects undefined values).
function normalizeInput(input: MarOrderInput) {
  return {
    medName: input.medName.trim(),
    dose: input.dose.trim(),
    units: input.units.trim(),
    route: input.route.trim(),
    frequencyLabel: input.frequencyLabel.trim(),
    scheduledTimes: input.isPRN
      ? []
      : Array.from(new Set(input.scheduledTimes.filter(Boolean))).sort(),
    isPRN: input.isPRN,
    indication: input.indication?.trim() ?? '',
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    orderingPhysician: input.orderingPhysician?.trim() ?? '',
    notes: input.notes?.trim() ?? '',
  };
}

/**
 * All medication orders for a client (active first, then by medication name).
 * Sorted client-side to avoid requiring a composite Firestore index.
 */
export async function getMarOrders(patientId: string): Promise<MarOrder[]> {
  try {
    const ref = collection(db, 'marOrders');
    const q = query(ref, where('patientId', '==', patientId));
    const snap = await getDocs(q);
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarOrder[];
    return orders.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
      return (a.medName || '').localeCompare(b.medName || '');
    });
  } catch (error) {
    console.error('Error fetching MAR orders:', error);
    return [];
  }
}

/** Create a new active medication order. Returns the new doc id. */
export async function addMarOrder(
  patientId: string,
  input: MarOrderInput,
  actor: MarActor,
): Promise<string> {
  try {
    const ref = collection(db, 'marOrders');
    const docRef = await addDoc(ref, {
      patientId,
      ...normalizeInput(input),
      status: 'active' as MarOrderStatus,
      createdAt: serverTimestamp(),
      createdBy: actor.uid,
      createdByName: actor.displayName,
      createdByRole: actor.role,
    });
    return docRef.id;
  } catch (error) {
    console.error('Error adding MAR order:', error);
    throw error;
  }
}

/** Edit an order's fields in place (typo/detail corrections). */
export async function updateMarOrder(
  id: string,
  input: MarOrderInput,
  actor: MarActor,
): Promise<void> {
  try {
    const ref = doc(db, 'marOrders', id);
    await updateDoc(ref, {
      ...normalizeInput(input),
      lastEditedAt: serverTimestamp(),
      lastEditedBy: actor.uid,
      lastEditedByName: actor.displayName,
    });
  } catch (error) {
    console.error('Error updating MAR order:', error);
    throw error;
  }
}

/**
 * Whether an order applies on a given date (YYYY-MM-DD): it must be active and
 * the date must fall on/after its start and on/before its end (if any). Used to
 * decide which meds a nurse is due to document for a shift's date of service.
 */
export function orderAppliesOn(order: MarOrder, date: string): boolean {
  if (order.status !== 'active') return false;
  if (!date) return true;
  if (order.startDate && date < order.startDate) return false;
  if (order.endDate && date > order.endDate) return false;
  return true;
}

/**
 * One append-only administration event: a nurse recording that a scheduled (or
 * PRN) dose was given, held, or refused, and by whom. Written once at note
 * submit; never edited or deleted (a correction is a new entry). Med details are
 * snapshotted so the record stays accurate even if the order later changes.
 */
export type AdminStatus = 'given' | 'held' | 'refused';

export interface MarAdministration {
  id?: string;
  patientId: string;
  orderId: string;
  medNameSnapshot: string;
  doseSnapshot: string;
  unitsSnapshot: string;
  routeSnapshot: string;
  indicationSnapshot?: string; // the order's "what for" at the time of this dose
  date: string; // YYYY-MM-DD (date of service)
  scheduledTime: string; // 'HH:MM' or 'PRN'
  status: AdminStatus;
  administeredByType: string; // 'nurse' | 'family' | 'responsibleParty' | 'self' | 'proxy'
  administratorName: string; // who physically gave it, when not the documenting nurse
  actualTime: string;
  initials: string;
  reason: string; // why held / refused, and why-given for a PRN dose
  sourceNoteId: string; // the progress note this was documented on
  documentedBy: string; // signed-in RN/LPN who recorded it
  documentedByName: string;
  documentedByCredential: string;
  // Amendment trail. A correction is a NEW administration doc that SUPERSEDES an
  // earlier one (the original is never edited or deleted): `amends` is the
  // superseded doc's id and `amendmentReason` records why. The amender signs the
  // new doc via documentedBy*/`at`, so the chain carries who-changed-what-when.
  amends?: string;
  amendmentReason?: string;
  at?: unknown;
}

// The per-row data the submit handler hands to writeMarAdministrations.
export interface MarAdministrationDraft {
  patientId: string; // pinned so writeMarAdministrations can re-assert ownership
  orderId: string;
  medName: string;
  dose: string;
  units: string;
  route: string;
  scheduledTime: string;
  status: AdminStatus;
  administeredByType: string;
  administratorName: string;
  actualTime: string;
  initials: string;
  reason: string;
  isPRN: boolean; // a PRN given dose keeps its reason (why it was given)
  indication: string; // the order's standing indication, snapshotted
}

export interface MarDocumenter {
  uid: string;
  name: string;
  credential: string;
}

/**
 * Write a batch of append-only administration entries for one note. All-or-
 * nothing among themselves. The Firestore rule pins documentedBy to the caller
 * and requires `at == request.time`, which serverTimestamp() satisfies on commit.
 */
export async function writeMarAdministrations(
  records: MarAdministrationDraft[],
  meta: { patientId: string; date: string; sourceNoteId: string; documenter: MarDocumenter },
): Promise<void> {
  if (records.length === 0) return;
  // Defense in depth against the cross-note dose leak: only write records that
  // belong to THIS note's client. The submit harvest already filters by
  // patientId (and session id), so in normal operation this drops nothing; it
  // is a structural backstop so a mark stamped for another client can never
  // ride along even if an upstream filter regresses. A record with no pinned
  // patientId (legacy draft) is trusted to meta.patientId.
  const safe = records.filter((r) => !r.patientId || r.patientId === meta.patientId);
  if (safe.length !== records.length) {
    console.error(
      `writeMarAdministrations: dropped ${records.length - safe.length} dose mark(s) not belonging to client ${meta.patientId}`,
    );
  }
  if (safe.length === 0) return;
  try {
    const batch = writeBatch(db);
    const col = collection(db, 'marAdministrations');
    for (const r of safe) {
      batch.set(doc(col), { ...buildMarAdminFields(r, meta), at: serverTimestamp() });
    }
    await batch.commit();
  } catch (error) {
    console.error('Error writing MAR administrations:', error);
    throw error;
  }
}

/** All administrations documented for a client on one calendar day (any nurse,
 *  any note). Powers the "already given" indicator and the medication chart's
 *  day view. Equality-only query (no composite index); fails open to [] when
 *  the caller isn't yet on the client's care team. */
export async function getAdministrationsForDay(
  patientId: string,
  date: string,
): Promise<MarAdministration[]> {
  try {
    const ref = collection(db, 'marAdministrations');
    const q = query(ref, where('patientId', '==', patientId), where('date', '==', date));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarAdministration[];
  } catch (error) {
    console.error('Error fetching day administrations:', error);
    return [];
  }
}

/** Whether an order's active window overlaps a date range at all; used to
 *  decide which meds belong on a month's MAR (discontinued orders still show
 *  for the days they applied). */
export function orderOverlapsRange(order: MarOrder, start: string, end: string): boolean {
  if (order.startDate && order.startDate > end) return false;
  if (order.endDate && order.endDate < start) return false;
  return true;
}

/** All administrations for a client within a date range (inclusive). Backs the
 *  monthly MAR grid. Requires the (patientId, date) composite index. */
export async function getAdministrationsForRange(
  patientId: string,
  start: string,
  end: string,
): Promise<MarAdministration[]> {
  try {
    const ref = collection(db, 'marAdministrations');
    const q = query(
      ref,
      where('patientId', '==', patientId),
      where('date', '>=', start),
      where('date', '<=', end),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarAdministration[];
  } catch (error) {
    console.error('Error fetching range administrations:', error);
    return [];
  }
}

/** Recent administration history for one medication order (the per-med
 *  timeline). Sorted newest first client-side; callers slice to taste. */
export async function getAdministrationsForOrder(
  patientId: string,
  orderId: string,
): Promise<MarAdministration[]> {
  try {
    const ref = collection(db, 'marAdministrations');
    const q = query(ref, where('patientId', '==', patientId), where('orderId', '==', orderId));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarAdministration[];
    return items.sort((a, b) => {
      const byDate = (b.date || '').localeCompare(a.date || '');
      if (byDate !== 0) return byDate;
      return (b.actualTime || '').localeCompare(a.actualTime || '');
    });
  } catch (error) {
    console.error('Error fetching order administrations:', error);
    return [];
  }
}

/** Administrations recorded on a given progress note (for read-back in edit mode). */
export async function getMarAdministrationsByNote(sourceNoteId: string): Promise<MarAdministration[]> {
  try {
    const ref = collection(db, 'marAdministrations');
    const q = query(ref, where('sourceNoteId', '==', sourceNoteId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarAdministration[];
  } catch (error) {
    console.error('Error fetching MAR administrations:', error);
    return [];
  }
}

/**
 * Discontinue an order going forward. Sets status + endDate (never deletes) so
 * the order still appears on the days it applied and the history is preserved.
 */
export async function discontinueMarOrder(
  id: string,
  endDate: string,
  reason: string,
  actor: MarActor,
): Promise<void> {
  try {
    const ref = doc(db, 'marOrders', id);
    await updateDoc(ref, {
      status: 'discontinued' as MarOrderStatus,
      endDate,
      discontinuedAt: serverTimestamp(),
      discontinuedBy: actor.uid,
      discontinuedByName: actor.displayName,
      discontinueReason: reason.trim(),
    });
  } catch (error) {
    console.error('Error discontinuing MAR order:', error);
    throw error;
  }
}

/**
 * Medication-change record. A nurse (RN/LPN, in scope) can ADD a new med,
 * CHANGE an existing one (dose/route/frequency, handled as discontinue-old +
 * start-new), or DISCONTINUE one, all reflecting a physician's order.
 *
 * Lifecycle: the nurse STAGES the change on her note (status 'staged', written
 * immediately so it survives a reload but takes no effect yet). When she
 * SUBMITS the note, an Admin SDK route APPLIES it (creates/discontinues the
 * order) and flips it to status 'applied' + reviewStatus 'pending'. The RN
 * supervisor then simply REVIEWS it (acknowledges); there is no approval gate,
 * since maintaining the MAR per orders is within the nurse's scope.
 */
export type MarChangeRequestType = 'add' | 'change' | 'discontinue';
export type MarChangeRequestStatus = 'staged' | 'applied';
export type MarReviewStatus = 'pending' | 'reviewed';

export interface ProposedMed {
  medName: string;
  dose: string;
  units: string;
  route: string;
  frequencyLabel: string;
  scheduledTimes: string[];
  isPRN: boolean;
  indication: string;
  startDate: string;
  orderingPhysician: string;
  notes: string;
}

export interface MarChangeRequest {
  id?: string;
  patientId: string;
  patientName: string;
  type: MarChangeRequestType;
  proposedMed?: ProposedMed; // 'add' and 'change' (the NEW values)
  targetOrderId?: string; // 'change' and 'discontinue' (the order acted on)
  targetMedName?: string; // snapshot for display
  effectiveDate?: string; // 'change'/'discontinue': date it takes effect
  doseRecorded?: boolean; // 'add': nurse also staged a dose she gave
  reason: string;
  sourceNoteId: string; // the progress note this rides on
  status: MarChangeRequestStatus;
  // Who staged it (the documenting nurse).
  performedBy: string;
  performedByName: string;
  performedByCredential: string;
  stagedAt?: unknown;
  // Set when applied at note submit.
  appliedAt?: unknown;
  createdOrderId?: string; // new order id for add/change
  // RN review (acknowledgment only; no approval).
  reviewStatus?: MarReviewStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: unknown;
}

export interface MarChangeRequestInput {
  patientId: string;
  patientName: string;
  type: MarChangeRequestType;
  proposedMed?: ProposedMed; // add / change
  targetOrderId?: string; // change / discontinue
  targetMedName?: string; // change / discontinue (snapshot)
  effectiveDate?: string; // change / discontinue
  doseRecorded?: boolean; // add
  reason: string;
}

function normalizeProposed(p: ProposedMed): ProposedMed {
  return {
    medName: p.medName.trim(),
    dose: p.dose.trim(),
    units: p.units.trim(),
    route: p.route.trim(),
    frequencyLabel: p.frequencyLabel.trim(),
    scheduledTimes: p.isPRN ? [] : Array.from(new Set(p.scheduledTimes.filter(Boolean))).sort(),
    isPRN: p.isPRN,
    indication: p.indication.trim(),
    startDate: p.startDate,
    orderingPhysician: p.orderingPhysician.trim(),
    notes: p.notes.trim(),
  };
}

/**
 * Stage a medication change on a note (status 'staged'). Takes no effect until
 * the note is submitted (the apply route turns it into a real order change).
 * Written immediately so it survives a draft reload.
 */
export async function stageChangeRequest(
  input: MarChangeRequestInput,
  actor: MarDocumenter,
  sourceNoteId: string,
): Promise<string> {
  try {
    const payload: Record<string, unknown> = {
      patientId: input.patientId,
      patientName: input.patientName,
      type: input.type,
      reason: input.reason.trim(),
      doseRecorded: !!input.doseRecorded,
      sourceNoteId,
      status: 'staged' as MarChangeRequestStatus,
      performedBy: actor.uid,
      performedByName: actor.name,
      performedByCredential: actor.credential,
      stagedAt: serverTimestamp(),
    };
    if ((input.type === 'add' || input.type === 'change') && input.proposedMed) {
      payload.proposedMed = normalizeProposed(input.proposedMed);
    }
    if (input.type === 'change' || input.type === 'discontinue') {
      payload.targetOrderId = input.targetOrderId || '';
      payload.targetMedName = input.targetMedName || '';
      payload.effectiveDate = input.effectiveDate || '';
    }
    const docRef = await addDoc(collection(db, 'marChangeRequests'), payload);
    return docRef.id;
  } catch (error) {
    console.error('Error staging MAR change:', error);
    throw error;
  }
}

/** Delete a still-staged change (e.g. the nurse removes it before submitting). */
export async function removeStagedChange(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'marChangeRequests', id));
  } catch (error) {
    console.error('Error removing staged MAR change:', error);
    throw error;
  }
}

/** Delete all still-staged changes for a note (e.g. when the note is discarded).
 *  Best-effort: never throws. Only touches 'staged' records, never applied ones. */
export async function deleteStagedChangesForNote(sourceNoteId: string): Promise<void> {
  try {
    const q = query(collection(db, 'marChangeRequests'), where('sourceNoteId', '==', sourceNoteId));
    const snap = await getDocs(q);
    const staged = snap.docs.filter((d) => (d.data() || {}).status === 'staged');
    await Promise.all(staged.map((d) => deleteDoc(d.ref)));
  } catch (error) {
    console.error('Error deleting staged changes for note:', error);
  }
}

function reqMillis(t: unknown): number {
  return t && typeof (t as { toMillis?: () => number }).toMillis === 'function'
    ? (t as { toMillis: () => number }).toMillis()
    : 0;
}

/** Live list of changes still STAGED on a given note (so the nurse sees what
 *  will apply on submit). Queried by performedBy (the caller's own uid) so it
 *  satisfies the nurse read rule, then filtered to this note + 'staged' status
 *  client-side. */
export function subscribeStagedChanges(
  sourceNoteId: string,
  performedBy: string,
  cb: (reqs: MarChangeRequest[]) => void,
): () => void {
  const q = query(collection(db, 'marChangeRequests'), where('performedBy', '==', performedBy));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarChangeRequest[];
      cb(
        items
          .filter((r) => r.status === 'staged' && r.sourceNoteId === sourceNoteId)
          .sort((a, b) => reqMillis(a.stagedAt) - reqMillis(b.stagedAt)),
      );
    },
    (err) => {
      console.error('Staged-change subscription error:', err);
      cb([]);
    },
  );
}

/** Live list of applied changes awaiting RN review (newest first). Staff-only.
 *  reviewStatus is only ever set to 'pending' once a change is applied, so this
 *  single-field query needs no composite index. */
export function subscribePendingReviews(cb: (reqs: MarChangeRequest[]) => void): () => void {
  const q = query(collection(db, 'marChangeRequests'), where('reviewStatus', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as MarChangeRequest[];
      items.sort((a, b) => reqMillis(b.appliedAt) - reqMillis(a.appliedAt));
      cb(items);
    },
    (err) => {
      console.error('Pending-review subscription error:', err);
      cb([]);
    },
  );
}

/** Live count of changes awaiting RN review, for the Records nav badge. */
export function subscribePendingReviewCount(cb: (n: number) => void): () => void {
  const q = query(collection(db, 'marChangeRequests'), where('reviewStatus', '==', 'pending'));
  return onSnapshot(
    q,
    (snap) => cb(snap.size),
    (err) => {
      console.error('Pending-review count error:', err);
      cb(0);
    },
  );
}
