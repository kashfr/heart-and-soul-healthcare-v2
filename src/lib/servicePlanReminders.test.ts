import { describe, expect, it } from 'vitest';
import { servicePlanStatus, servicePlanStatusLabel } from './servicePlanShared';
import {
  pickServicePlanReminderRecipients,
  servicePlanBellText,
  servicePlanDigestBellText,
  servicePlanReminderEmail,
  shouldSendServicePlanReminder,
} from './servicePlanReminders';

const plan = (signedDate: string, reviews: string[] = []) => ({ signedDate, reviews: reviews.map((d) => ({ reviewedDate: d })) as never });

describe('servicePlanStatus', () => {
  it('is due 62 days after the newest signing or review', () => {
    expect(servicePlanStatus(plan('2026-06-30'), '2026-09-30', 30)).toEqual({ stage: 'overdue', lastISO: '2026-06-30', dueISO: '2026-08-31' });
    expect(servicePlanStatus(plan('2026-06-30', ['2026-08-20']), '2026-09-30', 30)).toMatchObject({ stage: 'due-soon', dueISO: '2026-10-21' });
    expect(servicePlanStatus(plan('2026-09-28'), '2026-09-30', 30)).toMatchObject({ stage: 'current', dueISO: '2026-11-29' });
  });
  it('treats due today as due soon, and nothing on file as none', () => {
    expect(servicePlanStatus(plan('2026-07-30'), '2026-09-30', 7).stage).toBe('due-soon');
    expect(servicePlanStatus(null, '2026-09-30', 30)).toEqual({ stage: 'none', lastISO: '', dueISO: '' });
  });
  it('counts a paper plan filed under Documents, whichever is newer', () => {
    expect(servicePlanStatus(null, '2026-09-30', 30, ['2026-06-30', 'bad'])).toMatchObject({ stage: 'overdue', lastISO: '2026-06-30' });
    expect(servicePlanStatus(plan('2026-06-01'), '2026-09-30', 30, ['2026-09-15']).lastISO).toBe('2026-09-15');
  });
  it('labels each stage', () => {
    expect(servicePlanStatusLabel('overdue', '2026-08-31')).toBe('Overdue since 08/31/2026');
    expect(servicePlanStatusLabel('due-soon', '2026-10-21')).toBe('Due by 10/21/2026');
    expect(servicePlanStatusLabel('current', '2026-11-29')).toBe('Current through 11/29/2026');
    expect(servicePlanStatusLabel('none', '')).toBe('No service plan on file');
  });
});

describe('shouldSendServicePlanReminder', () => {
  const today = '2026-09-30';
  it('never reminds about a current plan', () => {
    expect(shouldSendServicePlanReminder(null, { stage: 'current', dueISO: '2026-11-29' }, today)).toBe(false);
  });
  it('reminds the first time, and when the stage or due date changes', () => {
    expect(shouldSendServicePlanReminder(null, { stage: 'overdue', dueISO: '2026-08-31' }, today)).toBe(true);
    expect(shouldSendServicePlanReminder({ stage: 'due-soon', dueISO: '2026-08-31', lastSentISO: '2026-08-25' }, { stage: 'overdue', dueISO: '2026-08-31' }, today)).toBe(true);
    expect(shouldSendServicePlanReminder({ stage: 'due-soon', dueISO: '2026-10-01', lastSentISO: '2026-09-29' }, { stage: 'due-soon', dueISO: '2026-10-05' }, today)).toBe(true);
  });
  it('says "due soon" once per due date, and repeats overdue or missing weekly', () => {
    expect(shouldSendServicePlanReminder({ stage: 'due-soon', dueISO: '2026-10-05', lastSentISO: '2026-09-28' }, { stage: 'due-soon', dueISO: '2026-10-05' }, today)).toBe(false);
    expect(shouldSendServicePlanReminder({ stage: 'overdue', dueISO: '2026-08-31', lastSentISO: '2026-09-24' }, { stage: 'overdue', dueISO: '2026-08-31' }, today)).toBe(false);
    expect(shouldSendServicePlanReminder({ stage: 'overdue', dueISO: '2026-08-31', lastSentISO: '2026-09-23' }, { stage: 'overdue', dueISO: '2026-08-31' }, today)).toBe(true);
    expect(shouldSendServicePlanReminder({ stage: 'none', dueISO: '', lastSentISO: '2026-09-23' }, { stage: 'none', dueISO: '' }, today)).toBe(true);
  });
});

describe('pickServicePlanReminderRecipients', () => {
  const eligible = new Set(['ashley', 'lilian', 'kaheem']);
  it('prefers the next scheduled visit, then the last visit, then the admins', () => {
    expect(pickServicePlanReminderRecipients({ nextVisitNurseId: 'ashley', lastVisitAuthorId: 'lilian', eligible, admins: ['kaheem'] })).toEqual(['ashley']);
    expect(pickServicePlanReminderRecipients({ nextVisitNurseId: '', lastVisitAuthorId: 'lilian', eligible, admins: ['kaheem'] })).toEqual(['lilian']);
    expect(pickServicePlanReminderRecipients({ nextVisitNurseId: '', lastVisitAuthorId: '', eligible, admins: ['kaheem'] })).toEqual(['kaheem']);
  });
  it('skips anyone who is not an active supervisor or admin', () => {
    expect(pickServicePlanReminderRecipients({ nextVisitNurseId: 'lindsey', lastVisitAuthorId: 'gone', eligible, admins: ['kaheem'] })).toEqual(['kaheem']);
  });
});

describe('reminder messages', () => {
  const items = [
    { patientId: 'p1', clientName: 'Cataleya Plaza', stage: 'overdue' as const, dueISO: '2026-08-31' },
    { patientId: 'p2', clientName: 'Ann Torres', stage: 'none' as const, dueISO: '' },
  ];
  it('the bell names the client', () => {
    expect(servicePlanBellText(items[0])).toBe('Service plan for Cataleya Plaza: overdue since 08/31/2026. Review or revise it at the next visit.');
    expect(servicePlanBellText(items[1])).toBe('Service plan needed for Ann Torres: no service plan on file.');
  });
  it('the email never names a client, and has no em dashes', () => {
    const m = servicePlanReminderEmail(items, 'Ashley');
    expect(m.subject).toBe('2 Service Plans Need Attention');
    expect(m.body).toContain("2 clients' service plans need attention: 1 overdue and 1 with no service plan on file.");
    expect(m.body).not.toMatch(/Cataleya|Torres/);
    expect(m.body).not.toMatch(/—|–/);
    expect(servicePlanReminderEmail([items[0]], '').subject).toBe('A Service Plan Needs Attention');
  });
  it('folds a long list into one bell, sorted by name', () => {
    expect(servicePlanDigestBellText(items)).toBe('Service plans need attention for 2 clients: Ann Torres (no service plan on file); Cataleya Plaza (overdue since 08/31/2026).');
  });
});
