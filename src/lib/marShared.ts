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
 * PDF MUST use the same comparator or their rows diverge.
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
    status: r.status,
    administeredByType: r.administeredByType || 'nurse',
    administratorName: isNurse ? '' : r.administratorName.trim(),
    actualTime: r.status === 'given' ? r.actualTime : '',
    initials: r.initials.trim(),
    reason: r.status === 'given' && !isPRN ? '' : r.reason.trim(),
    sourceNoteId: meta.sourceNoteId,
    documentedBy: meta.documenter.uid,
    documentedByName: meta.documenter.name,
    documentedByCredential: meta.documenter.credential,
  };
}
