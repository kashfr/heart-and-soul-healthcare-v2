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

/**
 * THE initials derivation: FIRST name + LAST name initial, uppercased
 * ("Sarah Smith" -> SS, "Ma Jamie Ann Yap" -> MY — first token is the first
 * name, last token is the surname, middle names don't sign). Initials are a
 * signature on a legal record, so they are ALWAYS derived from the documenter's
 * profile name at write time — never typed, never trusted from a draft. Before
 * this there were three different derivations plus a free-text input, which let
 * one nurse sign four different ways (MJ / MY / MJA / hand-typed "MYap") and
 * duplicated her in the signature legend.
 */
export function deriveInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  /** Ignored at write time (kept for draft-shape compatibility): the stored
   *  initials are ALWAYS derived from meta.documenter.name. */
  initials?: string;
  reason: string;
  isPRN?: boolean;
  indication?: string;
  // The PRN effectiveness follow-up ("what happened"): pain 6/10 to 2/10, fever
  // down, etc. Meaningful only for a GIVEN PRN dose; blanked otherwise.
  outcome?: string;
  // D.4.d proof trail: the documenter attests she notified the prescriber of
  // this refusal/hold at documentation time. Meaningful only for held/refused
  // doses; forced false otherwise. (Notified later? The existing amend flow
  // records it as an appended correction.)
  prescriberNotified?: boolean;
  // Measurement for a check-style order (MarOrder.valueLabel), e.g. a gastric
  // residual in mL. Meaningful only on a GIVEN (performed) entry; a check that
  // was held or refused produced no reading, so it is blanked.
  value?: string;
  valueLabel?: string;
  valueUnit?: string;
  // The nurse checked the explicit "no note on file — I personally
  // administered this" attestation in the grid modal. Persisted so the record
  // shows which control path admitted it. Meaningful only for a nurse-given
  // dose; forced false otherwise.
  noNoteAttestation?: boolean;
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
    // Derived, never typed: the initials sign the record for the DOCUMENTER
    // (who physically gave a family/proxy dose is carried by administratorName
    // and the grid's * marker). Falls back to any provided value only when the
    // documenter has no name to derive from (should never happen in practice).
    initials: deriveInitials(meta.documenter.name) || (r.initials || '').trim().toUpperCase(),
    reason: r.status === 'given' && !isPRN ? '' : r.reason.trim(),
    outcome: r.status === 'given' && isPRN ? (r.outcome || '').trim() : '',
    prescriberNotified: r.status !== 'given' && r.prescriberNotified === true,
    noNoteAttestation: r.status === 'given' && isNurse && r.noNoteAttestation === true,
    // A reading exists only where the check was actually performed. The label
    // and unit ride along so the number stays interpretable if the order that
    // defined them is later edited.
    value: r.status === 'given' ? (r.value || '').trim() : '',
    valueLabelSnapshot: (r.valueLabel || '').trim(),
    valueUnitSnapshot: (r.valueUnit || '').trim(),
    sourceNoteId: meta.sourceNoteId,
    documentedBy: meta.documenter.uid,
    documentedByName: meta.documenter.name,
    documentedByCredential: meta.documenter.credential,
  };
}

/**
 * Normalise an allowed-values list from either an array or the comma-separated
 * string the order forms collect. Trims, drops blanks, and de-duplicates while
 * PRESERVING the author's order — a clinical scale reads in the order it was
 * written, so this must not sort.
 */
export function parseValueOptions(input: string[] | string | undefined): string[] {
  const raw = Array.isArray(input) ? input : String(input || '').split(',');
  const out: string[] = [];
  for (const item of raw) {
    const v = String(item).trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Sensible default scale for a volume reading, used to pre-fill the order form. */
export const DEFAULT_ML_VALUE_OPTIONS = [
  '0', '5', '10', '15', '20', '25', '30', '40', '50', '75', '100', '150', '200', '250', 'More than 250',
];

// ---------------------------------------------------------------------------
// Correction vs. new regimen: what a "change" actually does to the order.
// ---------------------------------------------------------------------------

/**
 * Fields that define HOW the med is given. Editing any of them is a genuine
 * regimen change, so the old order is discontinued and a replacement starts on
 * the effective date — that is what keeps every charted dose tied to the terms
 * it was given under, and it's the paper-MAR convention (line out, rewrite).
 *
 * Everything NOT listed here documents WHO ordered the med and WHY. Editing
 * only those is a correction to the same order: it is updated in place, no
 * discontinue, no second row. Filling in an ordering physician that was never
 * transcribed is the motivating case — nothing about the administration
 * changed, so showing the med as D/C'd misrepresents the record.
 *
 * `valueOptions` is deliberately on the correction side: the allowed-readings
 * list is a charting aid (what the nurse may pick from), not a term of the
 * physician's order, and each administration snapshots its own reading anyway.
 */
export const REGIMEN_FIELDS = [
  'medName',
  'dose',
  'units',
  'route',
  'frequencyLabel',
  'scheduledTimes',
  'isPRN',
  'prnFrequencyLabel',
  'valueLabel',
  'valueUnit',
] as const;

export type RegimenField = (typeof REGIMEN_FIELDS)[number];

/** How a change was applied. 'correction' edits the order in place; 'regimen'
 *  discontinues it and starts a replacement. */
export type MarChangeKind = 'correction' | 'regimen';

/** Human labels for the regimen fields, for the "this will start a new order
 *  because X changed" hint. */
export const REGIMEN_FIELD_LABELS: Record<RegimenField, string> = {
  medName: 'medication',
  dose: 'dose',
  units: 'units',
  route: 'route',
  frequencyLabel: 'frequency',
  scheduledTimes: 'scheduled times',
  isPRN: 'PRN/scheduled',
  prnFrequencyLabel: 'PRN frequency',
  valueLabel: 'measurement',
  valueUnit: 'measurement unit',
};

/** The subset of an order (or a proposal) the regimen comparison reads. */
export interface RegimenComparable {
  medName?: string;
  dose?: string;
  units?: string;
  route?: string;
  frequencyLabel?: string;
  scheduledTimes?: string[];
  isPRN?: boolean;
  prnFrequencyLabel?: string;
  valueLabel?: string;
  valueUnit?: string;
}

function normText(v: unknown): string {
  return String(v ?? '').trim();
}

/** Scheduled times compared as a set: order and duplicates are storage detail,
 *  and a PRN order carries none, so re-saving must not read as a change. */
function normTimes(times: unknown, isPRN: boolean): string {
  if (isPRN) return '';
  const arr = Array.isArray(times) ? times.map((t) => String(t).trim()).filter(Boolean) : [];
  return Array.from(new Set(arr)).sort().join(',');
}

/**
 * Which regimen fields differ between the order as it stands and the proposed
 * values. Empty means the edit touches documentation only.
 *
 * Pure and shared: the modal calls it to tell the nurse what will happen before
 * she saves, and the server calls it again to decide what actually happens, so
 * the two can never disagree.
 */
export function regimenFieldsChanged(
  current: RegimenComparable,
  proposed: RegimenComparable,
): RegimenField[] {
  const currentPRN = current.isPRN === true;
  const proposedPRN = proposed.isPRN === true;
  const changed: RegimenField[] = [];
  if (normText(current.medName) !== normText(proposed.medName)) changed.push('medName');
  if (normText(current.dose) !== normText(proposed.dose)) changed.push('dose');
  if (normText(current.units) !== normText(proposed.units)) changed.push('units');
  if (normText(current.route) !== normText(proposed.route)) changed.push('route');
  // For a PRN order the frequency IS "as needed", so isPRN already carries the
  // meaning and the stored label varies by which form created the order. Only
  // compare labels when both sides are scheduled — otherwise every edit to a
  // PRN med would read as a frequency change and start a needless new regimen.
  if (!(currentPRN && proposedPRN) && normText(current.frequencyLabel) !== normText(proposed.frequencyLabel)) {
    changed.push('frequencyLabel');
  }
  if (currentPRN !== proposedPRN) changed.push('isPRN');
  // How often a PRN med MAY be given (Q4H PRN vs Q6H PRN) is a term of the
  // physician's order, so moving it starts a new regimen. Compared only when
  // both sides are PRN: a switch to or from PRN is already carried by isPRN,
  // and a scheduled order never carries a sub-frequency.
  if (currentPRN && proposedPRN && normText(current.prnFrequencyLabel) !== normText(proposed.prnFrequencyLabel)) {
    changed.push('prnFrequencyLabel');
  }
  if (normTimes(current.scheduledTimes, currentPRN) !== normTimes(proposed.scheduledTimes, proposedPRN)) {
    changed.push('scheduledTimes');
  }
  if (normText(current.valueLabel) !== normText(proposed.valueLabel)) changed.push('valueLabel');
  if (normText(current.valueUnit) !== normText(proposed.valueUnit)) changed.push('valueUnit');
  return changed;
}

/**
 * The frequency as it should read on the MAR, the order book, and the printed
 * record. A PRN order with a sub-frequency reads the way the order is written —
 * "Every 4 hours (Q4H) as needed (PRN)" — so the interval isn't lost off the
 * label. Everything else is the stored label as-is.
 */
export function describeFrequency(o: {
  frequencyLabel?: string;
  isPRN?: boolean;
  prnFrequencyLabel?: string;
}): string {
  const sub = normText(o.prnFrequencyLabel);
  if (o.isPRN === true && sub) return `${sub} as needed (PRN)`;
  return normText(o.frequencyLabel);
}

/** Whether a proposed change edits documentation only, leaving the order (and
 *  the MAR row) intact. */
export function isCorrectionOnly(current: RegimenComparable, proposed: RegimenComparable): boolean {
  return regimenFieldsChanged(current, proposed).length === 0;
}

/** "dose and frequency" / "dose, route and frequency" — for the hint text. */
export function describeRegimenChanges(fields: RegimenField[]): string {
  const names = fields.map((f) => REGIMEN_FIELD_LABELS[f]);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
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
  /** True when this entry was removed as entered-in-error (see
   *  voidMarAdministration). A voided entry is audit history: it is kept in
   *  Firestore but drops out of every live view, and its slot reopens. */
  voided?: boolean;
}

/** The records that are NOT superseded by any other record's `amends` pointer,
 *  i.e. the current/live value of each administration after corrections.
 *  A VOIDED record (entered in error) is dropped too — and because its
 *  predecessors in an amend chain remain superseded, voiding the head of a
 *  chain removes the whole logical dose rather than resurrecting the original.
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
  return list.filter((r) => !(r.id && superseded.has(r.id)) && r.voided !== true);
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

/**
 * Physician attribution (DBHDD FY27 manual D.1: every administered med needs a
 * current signed physician order). The forms REQUIRE an ordering physician,
 * but a required free-text field invites junk ("N/A") when the nurse genuinely
 * doesn't know at entry time — so instead of accepting junk, the forms offer
 * an explicit "unknown, flag for follow-up" checkbox (physicianPending). These
 * helpers power both the form-side junk rejection and the display-side badges,
 * and deliberately treat LEGACY junk values as pending so pre-existing "N/A"
 * orders surface for follow-up without a data migration.
 */
const UNKNOWN_PHYSICIAN_TOKENS = new Set([
  'na', 'none', 'unknown', 'unk', 'tbd', 'tba', 'pending', 'notavailable',
  'notapplicable', 'dontknow', 'donotknow', 'idk', 'x', 'xx', 'xxx',
]);

/** True when a typed ordering-physician value is a non-answer ("N/A", "?",
 *  "none", "tbd", …) rather than a name. Empty/whitespace counts. */
export function looksLikeUnknownPhysician(value: string | undefined | null): boolean {
  // Unicode-aware: keep LETTERS from any script so non-Latin names
  // (e.g. Korean or Cyrillic) don't strip to '' and misread as junk.
  const cleaned = (value || '').toLowerCase().replace(/[^\p{L}]/gu, '');
  return cleaned.length === 0 || UNKNOWN_PHYSICIAN_TOKENS.has(cleaned);
}

/** True when this order still needs real physician attribution: either the
 *  author explicitly flagged it (physicianPending) or the stored value is
 *  legacy junk/blank. Drives the amber "Physician needed" badges and the
 *  survey-readiness count. */
export function physicianAttributionPending(order: {
  physicianPending?: boolean;
  orderingPhysician?: string;
}): boolean {
  return order.physicianPending === true || looksLikeUnknownPhysician(order.orderingPhysician);
}

/**
 * Physician-order currency (DBHDD FY27 manual D.1: a current physician order,
 * dated and signed within the past YEAR, must back every administered med).
 * The order's `orderSignedDate` records the date on the most recent signed
 * order; older orders without it fall back to startDate (the form has always
 * said "use the date on the physician's order"). When a renewal comes in, the
 * RN updates orderSignedDate; the readiness tile stops counting it.
 */
export const PHYSICIAN_ORDER_MAX_AGE_DAYS = 365;

/** Days since the order was last signed (per orderSignedDate, falling back to
 *  startDate), or null when neither date parses. */
export function orderSignedAgeDays(
  order: { orderSignedDate?: string; startDate?: string },
  todayISO: string,
): number | null {
  const signed = (order.orderSignedDate || '').trim() || (order.startDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signed) || !/^\d{4}-\d{2}-\d{2}$/.test(todayISO)) return null;
  const ms = Date.parse(todayISO + 'T12:00:00Z') - Date.parse(signed + 'T12:00:00Z');
  return Math.floor(ms / 86400000);
}

/** True when the backing physician order is older than the 12-month window
 *  (or undatable) and needs a renewed signed order on file. */
export function physicianOrderStale(
  order: { orderSignedDate?: string; startDate?: string },
  todayISO: string,
): boolean {
  const age = orderSignedAgeDays(order, todayISO);
  return age === null || age > PHYSICIAN_ORDER_MAX_AGE_DAYS;
}

// ---------------------------------------------------------------------------
// Requires-MAR submit gate (progress note).
// ---------------------------------------------------------------------------

/** A scheduled dose the nurse must document before the note can be submitted. */
export interface RequiredDoseGap {
  orderId: string;
  medName: string;
  slot: string; // 'HH:MM'
}

/**
 * The scheduled doses a nurse still owes documentation for, for a client
 * flagged `requiresMar`. A dose is owed when it is a non-PRN slot on the date
 * of service, is not already marked in this note, was not already documented by
 * an earlier note today (priorSlots), and falls inside the nurse's shift window
 * (shiftStart..shiftEnd). Window rules:
 *  - no parseable shiftStart → the whole day is in scope (the nurse hasn't
 *    told us her window, so we can't safely exclude anything);
 *  - shift crossing midnight (explicit next-day end date, or end < start) →
 *    no upper bound on the date-of-service day;
 *  - a slot with an unparseable time can't be window-scoped, so it's owed.
 * Pure (no Date reads) for unit testing.
 */
export function computeRequiredDoseGaps(opts: {
  rows: Array<{ orderId: string; medName: string; slot: string; isPRN: boolean }>;
  markedSlots: Array<{ orderId: string; slot: string }>;
  priorSlots: Array<{ orderId: string; slot: string }>;
  shiftStart: string; // 'HH:MM' or ''
  shiftEnd: string; // 'HH:MM' or ''
  shiftEndsNextDay: boolean;
}): RequiredDoseGap[] {
  const slotKey = (m: { orderId: string; slot: string }) => `${m.orderId}|${m.slot}`;
  const marked = new Set(opts.markedSlots.map(slotKey));
  const prior = new Set(opts.priorSlots.map(slotKey));
  const start = parseHHMM(opts.shiftStart);
  const end = parseHHMM(opts.shiftEnd);
  const overnight = opts.shiftEndsNextDay || (start !== null && end !== null && end < start);
  const gaps: RequiredDoseGap[] = [];
  for (const r of opts.rows) {
    if (r.isPRN || r.slot === 'PRN') continue;
    if (marked.has(slotKey(r)) || prior.has(slotKey(r))) continue;
    const t = parseHHMM(r.slot);
    if (t !== null && start !== null) {
      if (t < start) continue; // due before the nurse arrived
      if (!overnight && end !== null && t > end) continue; // due after she left
    }
    gaps.push({ orderId: r.orderId, medName: r.medName, slot: r.slot });
  }
  return gaps;
}

/**
 * Dose-vs-shift-window classifier (owner request after a real incident: a
 * nurse working ~08:45-14:45 repeatedly charted 22:00 doses as nurse-given —
 * attesting she administered meds at a time she was not in the home; the
 * evening doses are in fact given by family, for which administeredByType
 * 'family'/'responsibleParty' with the MAR star is the correct record).
 *
 * A dose time is judged against the nurse's shift [start - grace, end + grace]
 * on the date of service. Overnight shifts (explicit next-day end, or
 * end < start) have no upper bound on the service-day side, mirroring
 * computeRequiredDoseGaps: the tail of an overnight shift falls on the NEXT
 * calendar day, whose doses are charted under that next date.
 *
 * 'unknown' (any time unparseable) is NOT treated as outside — callers fail
 * open, because a half-filled form must not block unrelated charting; the
 * required-field and shift-sanity gates own missing/invalid times.
 */
export type DoseWindowVerdict = 'inside' | 'outside' | 'unknown';
export const SHIFT_WINDOW_GRACE_MINUTES = 60;

export function classifyDoseAgainstShift(opts: {
  doseTime: string; // 'HH:MM' — the actual time when known, else the slot
  shiftStart: string;
  shiftEnd: string;
  shiftEndsNextDay: boolean;
  graceMinutes?: number;
}): DoseWindowVerdict {
  const dose = parseHHMM(opts.doseTime);
  const start = parseHHMM(opts.shiftStart);
  const end = parseHHMM(opts.shiftEnd);
  if (dose === null || start === null) return 'unknown';
  const grace = opts.graceMinutes ?? SHIFT_WINDOW_GRACE_MINUTES;
  const lo = start - grace;
  // A dose before the shift even starts is outside under BOTH the overnight
  // and same-day interpretations, so the verdict doesn't need the end time.
  // This lets the Page 5 warning fire during the normal forward fill, before
  // the nurse has reached the shift-end fields on the last page.
  if (dose < lo) return 'outside';
  if (end === null) return 'unknown';
  const overnight = opts.shiftEndsNextDay || end < start;
  if (overnight) return 'inside';
  return dose <= end + grace ? 'inside' : 'outside';
}

/**
 * Verdict for a dose against a SET of shift windows (a nurse may have more
 * than one for a date: an approved split-shift second note, or the next-day
 * tail of the previous day's overnight note). 'inside' if ANY window contains
 * the dose; 'unknown' if none does but any window is unparseable (fail open);
 * 'outside' only when every window parsed and excluded it. Empty set is
 * 'unknown' — the caller owns no-note handling.
 */
export function classifyDoseAgainstShiftSet(
  doseTime: string,
  windows: Array<{ start: string; end: string; endsNextDay: boolean }>,
  graceMinutes?: number,
): DoseWindowVerdict {
  if (windows.length === 0) return 'unknown';
  const verdicts = windows.map((w) =>
    classifyDoseAgainstShift({
      doseTime,
      shiftStart: w.start,
      shiftEnd: w.end,
      shiftEndsNextDay: w.endsNextDay,
      graceMinutes,
    }),
  );
  if (verdicts.includes('inside')) return 'inside';
  if (verdicts.includes('unknown')) return 'unknown';
  return 'outside';
}

/**
 * The capture-time decision for a NURSE-GIVEN dose, given every window we
 * know about for its date. Principle: only a note DATED that same day is
 * authoritative enough to hard-block; the previous night's tail is evidence
 * that can ADMIT a dose (overnight back-charting) but never veto one — a
 * nurse mid-way through tonight's shift hasn't written tonight's note yet,
 * and her having worked last night must not leave her worse off than having
 * no note at all.
 *  - 'allow':  some window contains the dose, or a same-date window exists
 *              but times are unparseable (fail open).
 *  - 'block':  a same-date note exists and every parsed window excludes it.
 *  - 'attest': no note dated this day (tails-only or nothing) and the tails
 *              don't cover it — require the explicit personal attestation.
 */
export function decideNurseDoseGate(
  doseTime: string,
  windows: Array<{ start: string; end: string; endsNextDay: boolean; prevDayTail?: boolean }>,
  graceMinutes?: number,
): 'allow' | 'block' | 'attest' {
  const verdict = classifyDoseAgainstShiftSet(doseTime, windows, graceMinutes);
  if (verdict === 'inside') return 'allow';
  const hasSameDateNote = windows.some((w) => !w.prevDayTail);
  if (hasSameDateNote) return verdict === 'outside' ? 'block' : 'allow';
  return 'attest';
}
