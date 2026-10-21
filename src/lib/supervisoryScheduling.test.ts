import { describe, expect, it } from 'vitest';
import {
  autoNextVisitNote,
  autoOfferVisitNote,
  dailySupervisoryAction,
  nextSupervisoryDueISO,
  nextVisitAfterFiling,
  pendingSupervisoryVisit,
  supervisoryStage,
  supervisoryStageLabel,
  type SchedVisitLite,
} from './supervisoryScheduling';

const TODAY = '2026-10-01';
const v = (o: Partial<SchedVisitLite> & { date: string }): SchedVisitLite => ({
  id: o.id || `v-${o.date}`,
  type: 'supervisory',
  status: 'scheduled',
  nurseId: 'sup-1',
  ...o,
});

describe('the 30-day clock', () => {
  it('the next visit is due 30 days after the last one', () => {
    expect(nextSupervisoryDueISO('2026-09-15')).toBe('2026-10-15');
    expect(nextSupervisoryDueISO('')).toBe('');
    expect(nextSupervisoryDueISO('09/15/2026')).toBe('');
  });

  it('stages a client by the due date', () => {
    expect(supervisoryStage('', TODAY)).toEqual({ stage: 'none', dueISO: '' });
    expect(supervisoryStage('2026-08-20', TODAY)).toEqual({ stage: 'overdue', dueISO: '2026-09-19' });
    expect(supervisoryStage('2026-09-05', TODAY)).toEqual({ stage: 'due-soon', dueISO: '2026-10-05' });
    expect(supervisoryStage('2026-09-08', TODAY)).toEqual({ stage: 'due-soon', dueISO: '2026-10-08' }); // exactly 7 days out
    expect(supervisoryStage('2026-09-09', TODAY)).toEqual({ stage: 'current', dueISO: '2026-10-09' });
    expect(supervisoryStage(TODAY, TODAY).stage).toBe('current');
  });

  it('words the stage', () => {
    expect(supervisoryStageLabel('none', '')).toBe('no supervisory visit on record');
    expect(supervisoryStageLabel('overdue', '2026-09-19')).toBe('overdue since 09/19/2026');
    expect(supervisoryStageLabel('due-soon', '2026-10-05')).toBe('due 10/05/2026');
    expect(supervisoryStageLabel('current', '2026-10-09')).toBe('next due 10/09/2026');
  });
});

describe('pendingSupervisoryVisit', () => {
  it('finds the soonest scheduled supervisory visit from today on', () => {
    const visits = [v({ date: '2026-10-20' }), v({ date: '2026-10-05' }), v({ date: '2026-09-20', status: 'completed' })];
    expect(pendingSupervisoryVisit(visits, TODAY)?.date).toBe('2026-10-05');
  });

  it('ignores shift visits, cancelled visits, and past assigned visits', () => {
    expect(pendingSupervisoryVisit([v({ date: '2026-10-05', type: 'shift' })], TODAY)).toBeNull();
    expect(pendingSupervisoryVisit([v({ date: '2026-10-05', status: 'cancelled' })], TODAY)).toBeNull();
    expect(pendingSupervisoryVisit([v({ date: '2026-09-28' })], TODAY)).toBeNull();
  });

  it('an open offer nobody took still counts even after its date passed', () => {
    const open = v({ date: '2026-09-28', nurseId: '', offeredToAll: true });
    expect(pendingSupervisoryVisit([open], TODAY)?.id).toBe(open.id);
  });
});

describe('nextVisitAfterFiling', () => {
  it('schedules 30 days after the filed visit when nothing is pending', () => {
    expect(nextVisitAfterFiling([], '2026-10-01', TODAY)).toEqual({ date: '2026-10-31' });
    // The visit being filed is still 'scheduled' in the list the caller read.
    expect(nextVisitAfterFiling([v({ date: '2026-10-01' })], '2026-10-01', TODAY)).toEqual({ date: '2026-10-31' });
  });

  it('does nothing when a later supervisory visit is already on the calendar', () => {
    expect(nextVisitAfterFiling([v({ date: '2026-10-20' })], '2026-10-01', TODAY)).toBeNull();
    expect(nextVisitAfterFiling([v({ date: '2026-10-20', nurseId: '', offeredToAll: true })], '2026-10-01', TODAY)).toBeNull();
  });

  it('a late-filed visit still schedules from the visit date, not today', () => {
    expect(nextVisitAfterFiling([], '2026-09-20', TODAY)).toEqual({ date: '2026-10-20' });
    expect(nextVisitAfterFiling([], '', TODAY)).toBeNull();
  });
});

describe('dailySupervisoryAction', () => {
  it('leaves a client with an assigned pending visit alone', () => {
    expect(dailySupervisoryAction({ visits: [v({ date: '2026-10-03' })], lastVisitISO: '2026-09-03', todayISO: TODAY })).toEqual({ kind: 'none' });
    // Even one that is overdue to be filed: the reminders and the Needs
    // Attention row own that.
    expect(dailySupervisoryAction({ visits: [v({ date: '2026-09-28' })], lastVisitISO: '', todayISO: TODAY }).kind).toBe('create');
  });

  it('creates an open visit when the next one is due soon, overdue, or never happened', () => {
    expect(dailySupervisoryAction({ visits: [], lastVisitISO: '2026-09-05', todayISO: TODAY })).toEqual({ kind: 'create', date: '2026-10-05', stage: 'due-soon', dueISO: '2026-10-05' });
    expect(dailySupervisoryAction({ visits: [], lastVisitISO: '2026-08-20', todayISO: TODAY })).toEqual({ kind: 'create', date: TODAY, stage: 'overdue', dueISO: '2026-09-19' });
    expect(dailySupervisoryAction({ visits: [], lastVisitISO: '', todayISO: TODAY })).toEqual({ kind: 'create', date: TODAY, stage: 'none', dueISO: '' });
  });

  it('does nothing while the next visit is more than 7 days out', () => {
    expect(dailySupervisoryAction({ visits: [], lastVisitISO: '2026-09-20', todayISO: TODAY })).toEqual({ kind: 'none' });
  });

  it('re-offers an open visit weekly until someone takes it', () => {
    const open = v({ date: '2026-10-05', nurseId: '', offeredToAll: true, lastOfferedISO: '2026-09-24' });
    expect(dailySupervisoryAction({ visits: [open], lastVisitISO: '2026-09-05', todayISO: TODAY })).toEqual({ kind: 'reoffer', visit: open });
    const fresh = { ...open, lastOfferedISO: '2026-09-28' };
    expect(dailySupervisoryAction({ visits: [fresh], lastVisitISO: '2026-09-05', todayISO: TODAY })).toEqual({ kind: 'none' });
    const neverStamped = { ...open, lastOfferedISO: '' };
    expect(dailySupervisoryAction({ visits: [neverStamped], lastVisitISO: '2026-09-05', todayISO: TODAY }).kind).toBe('reoffer');
  });

  it('never creates a second open visit for a client', () => {
    const open = v({ date: '2026-09-25', nurseId: '', offeredToAll: true, lastOfferedISO: '2026-09-30' });
    expect(dailySupervisoryAction({ visits: [open], lastVisitISO: '', todayISO: TODAY })).toEqual({ kind: 'none' });
  });
});

describe('notes stamped on portal-made visits', () => {
  it('say where the visit came from', () => {
    expect(autoNextVisitNote('2026-10-01')).toBe('Scheduled automatically 30 days after the supervisory visit filed for 10/01/2026.');
    expect(autoOfferVisitNote('overdue', '2026-09-19')).toBe('Created by the portal: supervisory visit overdue since 09/19/2026. Offered to all supervisors; the first to accept takes it.');
  });
});
