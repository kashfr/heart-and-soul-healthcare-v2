/**
 * Pure MAR helpers shared by the client (monthly grid page) and the server
 * (/api/mar/pdf route). Keep this file free of any Firebase import; the PDF
 * route must not pull the client SDK into the server bundle.
 */

export interface MarOrderSortable {
  medName?: string;
  startDate?: string;
  id?: string;
}

/**
 * Deterministic row order for a monthly MAR: medication name, then regimen
 * start date, then id. The date tiebreaker matters when one med has several
 * regimens in a month (a dose change = discontinued order + new order): the
 * old line lists first and its replacement directly below, like the
 * line-through-and-rewrite convention on a paper MAR. The web grid and the
 * PDF both use this comparator for intra-group order; the PDF additionally
 * groups non-PRN before PRN (DBHDD FY27 manual D.6.a/D.6.b requires the
 * printed MAR to keep routine and PRN meds in separate portions). The screen
 * keeps the flat alphabetical order for now; if it ever adopts the grouping,
 * reuse the PDF's isPRN-then-compareMarOrders sort.
 */
export function compareMarOrders(a: MarOrderSortable, b: MarOrderSortable): number {
  return (
    (a.medName || '').localeCompare(b.medName || '') ||
    (a.startDate || '').localeCompare(b.startDate || '') ||
    (a.id || '').localeCompare(b.id || '')
  );
}

/** The per-row data a marked dose carries into the administration write. Kept
 *  structural (not importing the mar.ts type) so this module stays Firebase
 *  free and unit-testable. */
export interface MarAdminFieldInput {
  orderId: string;
  medName: string;
  dose: string;
  units: string;
  route: string;
  scheduledTime: string; // 'HH:MM', 'PRN', or 'unscheduled'
  status: 'given' | 'held' | 'refused';
  administeredByType: string;
  administratorName: string;
  actualTime: string;
  initials: string;
  reason: string;
  isPRN?: boolean;
  indication?: string;
  // The PRN effectiveness follow-up ("what happened"): pain 6/10 to 2/10, fever
  // down, etc. Meaningful only for a GIVEN PRN dose; blanked otherwise.
  outcome?: string;
}

export interface MarAdminFieldMeta {
  patientId: string;
  date: string;
  sourceNoteId: string;
  documenter: { uid: string; name: string; credential: string };
}

/**
 * Build the stored field map for one append-only administration doc (every
 * field except the `at` server timestamp the caller appends). Pure so the
 * status-dependent rules are unit-testable:
 *  - actualTime is kept only for a 'given' dose.
 *  - administratorName is blanked when the nurse herself gave it.
 *  - reason is the why-held / why-refused note for non-given doses, AND the
 *    why-given note for a PRN ("as needed") dose; only a SCHEDULED given dose
 *    carries no reason. (Earlier this blanked the reason for every 'given',
 *    which silently dropped a PRN dose's clinical indication.)
 *  - outcome (the PRN effectiveness follow-up) is kept only for a GIVEN PRN
 *    dose — the "why given -> given -> what happened" loop. It may be empty at
 *    write time (recorded later via /api/mar/outcome for grid-charted doses).
 *  - the order's standing indication is snapshotted onto the record.
 */
export function buildMarAdminFields(r: MarAdminFieldInput, meta: MarAdminFieldMeta) {
  const isNurse = !r.administeredByType || r.administeredByType === 'nurse';
  const isPRN = !!r.isPRN || r.scheduledTime === 'PRN';
  return {
    patientId: meta.patientId,
    orderId: r.orderId,
    medNameSnapshot: r.medName,
    doseSnapshot: r.dose,
    unitsSnapshot: r.units,
    routeSnapshot: r.route,
    indicationSnapshot: (r.indication || '').trim(),
    date: meta.date,
    scheduledTime: r.scheduledTime,
    // Persisted so later flows (amend rebuilds, displays) can tell an
    // as-needed dose from a scheduled one without re-deriving it from the slot
    // — an unscheduled one-off PRN dose has scheduledTime 'unscheduled'.
    isPRN,
    status: r.status,
    administeredByType: r.administeredByType || 'nurse',
    administratorName: isNurse ? '' : r.administratorName.trim(),
    actualTime: r.status === 'given' ? r.actualTime : '',
    initials: r.initials.trim(),
    reason: r.status === 'given' && !isPRN ? '' : r.reason.trim(),
    outcome: r.status === 'given' && isPRN ? (r.outcome || '').trim() : '',
    sourceNoteId: meta.sourceNoteId,
    documentedBy: meta.documenter.uid,
    documentedByName: meta.documenter.name,
    documentedByCredential: meta.documenter.credential,
  };
}

// ---------------------------------------------------------------------------
// Time-aware live status (the in-progress MAR colors the dose pill by this).
// ---------------------------------------------------------------------------

/**
 * Time-relative status of a still-UNDOCUMENTED scheduled dose, for the live MAR.
 *  - 'none'   : not time-relevant (PRN, unparseable time, or not today's date —
 *               we never paint a backdated/future-dated note red).
 *  - 'future' : the scheduled time hasn't arrived yet (neutral).
 *  - 'due'    : within `graceMin` after the scheduled time (amber: coming up / due now).
 *  - 'late'   : more than `graceMin` past the scheduled time (red: needs attention).
 * Pure (no Date): the caller passes `nowMinutes` (minutes since local midnight)
 * so it stays unit-testable and free of render-time clock reads.
 */
export type DoseTimeStatus = 'none' | 'future' | 'due' | 'late';

export function parseHHMM(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function doseTimeStatus(
  scheduledTime: string,
  nowMinutes: number,
  opts: { graceMin?: number; isToday: boolean },
): DoseTimeStatus {
  if (!opts.isToday) return 'none';
  const due = parseHHMM(scheduledTime);
  if (due === null) return 'none';
  const grace = opts.graceMin ?? 60;
  if (nowMinutes < due) return 'future';
  if (nowMinutes <= due + grace) return 'due';
  return 'late';
}

// ---------------------------------------------------------------------------
// Amendment chains. A correction is a new doc that supersedes an earlier one via
// an `amends` pointer (pointer-based, so PRN doses that share a slot key still
// resolve correctly). These helpers collapse a flat list to its live records and
// expose the audit chain. Structural type keeps this module Firebase-free.
// ---------------------------------------------------------------------------

export interface AmendableRecord {
  id?: string;
  amends?: string;
}

/** The records that are NOT superseded by any other record's `amends` pointer,
 *  i.e. the current/live value of each administration after corrections.
 *
 *  INVARIANT: callers must pass COMPLETE chains. An amendment doc inherits the
 *  original's `date` and `orderId` (see amendMarAdministration), so every member
 *  of a chain falls in the same date+order and is loaded together by the
 *  date-range / per-order queries that feed this. If that ever changes (e.g. an
 *  amendment is allowed to move the date of service), this must walk chains
 *  transitively instead, or a missing intermediate would un-supersede the
 *  original and show it as a second live dose. */
export function resolveCurrentAdministrations<T extends AmendableRecord>(list: T[]): T[] {
  const superseded = new Set<string>();
  for (const r of list) if (r.amends) superseded.add(r.amends);
  return list.filter((r) => !(r.id && superseded.has(r.id)));
}

/** The full amendment chain for a current record, oldest original first through
 *  to the current record last, by walking `amends` pointers. Cycle-safe. */
export function amendmentChain<T extends AmendableRecord>(current: T, list: T[]): T[] {
  const byId = new Map<string, T>();
  for (const r of list) if (r.id) byId.set(r.id, r);
  const chain: T[] = [current];
  const seen = new Set<string>();
  let cur: T | undefined = current;
  while (cur && cur.amends && !seen.has(cur.amends)) {
    seen.add(cur.amends);
    const prev = byId.get(cur.amends);
    if (!prev) break;
    chain.unshift(prev);
    cur = prev;
  }
  return chain;
}
