/**
 * Supervisory visit scheduling rules: when the next visit is due, when one
 * should be created automatically, who is offered an open visit, and what
 * the messages say. Pure (no Firebase) so every rule is unit-tested; the
 * writes live in supervisorySchedulingServer.ts and patientVisits.ts.
 *
 * The owner's rule (10/01/2026): every client gets a supervisory visit every
 * 30 days. When a supervisor files one, the next is put on the calendar 30
 * days out and assigned to her. When a client has no future supervisory visit
 * scheduled and the next one is due within 7 days (or overdue, or there has
 * never been one), the portal creates an OPEN visit and offers it to every
 * supervisor; the first to accept takes it. An assignee who cannot make a
 * visit hands it to a named supervisor or releases it back to all of them.
 */
import { addDaysISO } from './servicePlanShared';

/** Days between supervisory visits (the client page's currency tile uses the same). */
export const SUPERVISORY_INTERVAL_DAYS = 30;
/** An open visit is created this many days before the next one is due. */
export const SUPERVISORY_OFFER_SOON_DAYS = 7;
/** An open visit nobody has accepted is offered again this often. */
export const SUPERVISORY_OFFER_REPEAT_DAYS = 7;

/** The part of a scheduled visit these rules read. */
export interface SchedVisitLite {
  id?: string;
  type: string;
  status: string;
  date: string;
  nurseId?: string;
  /** Open to every supervisor; the first to accept takes it. */
  offeredToAll?: boolean;
  lastOfferedISO?: string;
}

const isISO = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The date the next supervisory visit is due, from the date of the last one
 *  ('' when there has never been one). */
export function nextSupervisoryDueISO(lastVisitISO: string): string {
  return isISO(lastVisitISO) ? addDaysISO(lastVisitISO, SUPERVISORY_INTERVAL_DAYS) : '';
}

/** A supervisory visit still on the books for today or later (assigned or
 *  open). Overdue OPEN visits count too: an offer nobody took is still the
 *  client's pending visit, not a reason to create a second one. */
export function pendingSupervisoryVisit<T extends SchedVisitLite>(visits: T[], todayISO: string): T | null {
  const pending = visits.filter(
    (v) =>
      v.type === 'supervisory' &&
      v.status === 'scheduled' &&
      isISO(v.date) &&
      (v.date >= todayISO || (v.offeredToAll === true && !v.nurseId)),
  );
  pending.sort((a, b) => a.date.localeCompare(b.date));
  return pending[0] ?? null;
}

/**
 * After a supervisory visit is filed on `visitISO`: the next visit to put on
 * the calendar, or null when one is already pending for the client (someone
 * scheduled it by hand, or an earlier filing already did).
 */
export function nextVisitAfterFiling<T extends SchedVisitLite>(
  visits: T[],
  visitISO: string,
  todayISO: string,
): { date: string } | null {
  if (!isISO(visitISO)) return null;
  // The visit just filed is being marked completed by the caller; ignore it
  // and anything on or before that day.
  const later = visits.filter((v) => !(v.type === 'supervisory' && v.status === 'scheduled' && v.date <= visitISO));
  if (pendingSupervisoryVisit(later, todayISO)) return null;
  return { date: addDaysISO(visitISO, SUPERVISORY_INTERVAL_DAYS) };
}

export type SupervisoryStage = 'none' | 'due-soon' | 'overdue' | 'current';

/** Where a client stands on supervisory visits as of today. */
export function supervisoryStage(lastVisitISO: string, todayISO: string): { stage: SupervisoryStage; dueISO: string } {
  const dueISO = nextSupervisoryDueISO(lastVisitISO);
  if (!dueISO) return { stage: 'none', dueISO: '' };
  if (dueISO < todayISO) return { stage: 'overdue', dueISO };
  if (addDaysISO(todayISO, SUPERVISORY_OFFER_SOON_DAYS) >= dueISO) return { stage: 'due-soon', dueISO };
  return { stage: 'current', dueISO };
}

/**
 * The daily decision for one client: create an open visit (and on what date),
 * re-offer an open visit nobody has accepted, or do nothing.
 *  - A pending visit with a supervisor: nothing; her reminders cover it.
 *  - A pending OPEN visit: re-offer every 7 days.
 *  - Nothing pending and the next visit is due within 7 days, overdue, or
 *    there has never been one: create an open visit dated the due date (today
 *    when that has passed or there is no due date).
 */
export function dailySupervisoryAction<T extends SchedVisitLite>(p: {
  visits: T[];
  lastVisitISO: string;
  todayISO: string;
}): { kind: 'none' } | { kind: 'reoffer'; visit: T } | { kind: 'create'; date: string; stage: SupervisoryStage; dueISO: string } {
  const pending = pendingSupervisoryVisit(p.visits, p.todayISO);
  if (pending) {
    if (pending.nurseId || pending.offeredToAll !== true) return { kind: 'none' };
    const last = pending.lastOfferedISO || '';
    if (!isISO(last) || addDaysISO(last, SUPERVISORY_OFFER_REPEAT_DAYS) <= p.todayISO) {
      return { kind: 'reoffer', visit: pending };
    }
    return { kind: 'none' };
  }
  const { stage, dueISO } = supervisoryStage(p.lastVisitISO, p.todayISO);
  if (stage === 'current') return { kind: 'none' };
  const date = dueISO && dueISO > p.todayISO ? dueISO : p.todayISO;
  return { kind: 'create', date, stage, dueISO };
}

/** "overdue since 09/02/2026", "due 10/08/2026", "no supervisory visit on record". */
export function supervisoryStageLabel(stage: SupervisoryStage, dueISO: string): string {
  const us = (iso: string) => (isISO(iso) ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : iso);
  if (stage === 'none') return 'no supervisory visit on record';
  if (stage === 'overdue') return `overdue since ${us(dueISO)}`;
  if (stage === 'due-soon') return `due ${us(dueISO)}`;
  return `next due ${us(dueISO)}`;
}

/** Note stamped on a visit the portal created. */
export function autoNextVisitNote(filedISO: string): string {
  return `Scheduled automatically ${SUPERVISORY_INTERVAL_DAYS} days after the supervisory visit filed for ${filedISO.slice(5, 7)}/${filedISO.slice(8, 10)}/${filedISO.slice(0, 4)}.`;
}

export function autoOfferVisitNote(stage: SupervisoryStage, dueISO: string): string {
  return `Created by the portal: supervisory visit ${supervisoryStageLabel(stage, dueISO)}. Offered to all supervisors; the first to accept takes it.`;
}
