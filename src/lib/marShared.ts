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
