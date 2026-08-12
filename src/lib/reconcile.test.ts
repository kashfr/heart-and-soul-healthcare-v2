import { describe, it, expect } from 'vitest';
import {
  reconcilePatient,
  worstSeverity,
  summarize,
  EXPIRY_WARN_DAYS,
  type ReconcileSubject,
} from './reconcile';

const TODAY = '2026-08-12';

/** A fully-consistent daily-LPN client, used as the baseline to perturb. */
const dailyLpn: ReconcileSubject = {
  name: 'Lahin Lalani',
  program: 'now-comp',
  serviceLevel: 'rn-lpn-daily',
  requiresMar: true,
  assignedNurseIds: ['nurse-1'],
  serviceStartedOn: '2026-08-12',
  authorizations: [
    { serviceCode: 'NL1', frequency: 'Daily', amount: 3, from: '2026-08-12', to: '2027-02-11' },
    { serviceCode: 'NR1', frequency: 'Monthly', amount: 4, from: '2026-08-12', to: '2027-02-11' },
  ],
};

const rules = (s: ReconcileSubject, today = TODAY) =>
  reconcilePatient(s, today).map((f) => f.rule);

describe('reconcilePatient', () => {
  it('returns nothing when everything lines up', () => {
    expect(reconcilePatient(dailyLpn, TODAY)).toEqual([]);
  });

  it('catches the Lahin case: daily LPN authorization, oversight-only classification', () => {
    const f = reconcilePatient({ ...dailyLpn, serviceLevel: 'rn-oversight' }, TODAY);
    expect(f.map((x) => x.rule)).toContain('auth-says-daily-lpn');
    expect(f.find((x) => x.rule === 'auth-says-daily-lpn')!.severity).toBe('error');
    expect(f.find((x) => x.rule === 'auth-says-daily-lpn')!.message).toContain('RN oversight only');
  });

  it('catches the reverse: classified daily LPN with no such authorization', () => {
    const onlyRn = [{ serviceCode: 'NR1', frequency: 'Monthly', from: '2026-01-01', to: '2027-01-01' }];
    expect(rules({ ...dailyLpn, authorizations: onlyRn })).toContain('no-daily-lpn-auth');
  });

  it('flags daily care without a MAR or a care team', () => {
    const r = rules({ ...dailyLpn, requiresMar: false, assignedNurseIds: [] });
    expect(r).toContain('daily-care-no-mar');
    expect(r).toContain('daily-care-no-care-team');
  });

  it('applies the same daily-care checks to shift nursing', () => {
    const gapp: ReconcileSubject = {
      program: 'gapp',
      serviceLevel: 'skilled-nursing-shifts',
      requiresMar: false,
      assignedNurseIds: [],
      serviceStartedOn: '2026-01-05',
      authorizations: [{ serviceCode: 'T1000', frequency: 'Daily', from: '2026-01-01', to: '2027-01-01' }],
    };
    expect(rules(gapp)).toEqual(expect.arrayContaining(['daily-care-no-mar', 'daily-care-no-care-team']));
  });

  it('stays quiet about MAR and care team for a client who has not started', () => {
    // Joy Daughtrey's shape: classified, but the authorization begins later.
    const notStarted: ReconcileSubject = {
      program: 'now-comp',
      serviceLevel: 'rn-lpn-daily',
      requiresMar: false,
      assignedNurseIds: [],
      authorizations: [{ serviceCode: 'NL1', frequency: 'Daily', from: '2026-10-01', to: '2027-09-30' }],
    };
    const r = rules(notStarted);
    expect(r).not.toContain('daily-care-no-mar');
    expect(r).not.toContain('daily-care-no-care-team');
    expect(r).not.toContain('no-daily-lpn-auth');
    expect(r).toContain('authorization-not-started');
  });

  it('does not treat an active authorization as proof that service has started', () => {
    // Danielle Hall's shape: authorized weeks ago, proactively, not yet serving.
    const authorizedNotServing: ReconcileSubject = {
      program: 'now-comp',
      serviceLevel: 'rn-lpn-daily',
      requiresMar: false,
      assignedNurseIds: [],
      authorizations: [{ serviceCode: 'NL1', frequency: 'Daily', from: '2026-07-21', to: '2027-07-20' }],
    };
    expect(reconcilePatient(authorizedNotServing, TODAY)).toEqual([]);
  });

  it('starts checking once the service start date has passed, but not before', () => {
    const base: ReconcileSubject = {
      program: 'now-comp',
      serviceLevel: 'rn-lpn-daily',
      requiresMar: false,
      assignedNurseIds: [],
      authorizations: [{ serviceCode: 'NL1', frequency: 'Daily', from: '2026-07-21', to: '2027-07-20' }],
    };
    expect(rules({ ...base, serviceStartedOn: '2026-08-13' })).toEqual([]);
    expect(rules({ ...base, serviceStartedOn: '2026-08-12' })).toContain('daily-care-no-mar');
  });

  it('treats an authorization starting today as active', () => {
    // Lahin's NL1 begins 08/12; on that date it counts.
    expect(reconcilePatient(dailyLpn, '2026-08-12')).toEqual([]);
    expect(rules(dailyLpn, '2026-08-11')).toContain('authorization-not-started');
  });

  it('flags expired and expiring authorizations', () => {
    const expired = [{ serviceCode: 'NR1', frequency: 'Monthly', from: '2025-01-01', to: '2026-01-01' }];
    expect(rules({ program: 'now-comp', serviceLevel: 'rn-oversight', authorizations: expired })).toContain(
      'authorization-expired',
    );

    const soon = [{ serviceCode: 'NR1', frequency: 'Monthly', from: '2025-09-01', to: '2026-08-20' }];
    const r = reconcilePatient(
      { program: 'now-comp', serviceLevel: 'rn-oversight', authorizations: soon },
      TODAY,
    );
    const hit = r.find((f) => f.rule === 'authorization-expiring')!;
    expect(hit.message).toContain('8 days');
  });

  it('does not warn about expiry well outside the window', () => {
    const far = [{ serviceCode: 'NR1', frequency: 'Monthly', from: '2026-01-01', to: '2027-06-01' }];
    expect(rules({ program: 'now-comp', serviceLevel: 'rn-oversight', authorizations: far })).not.toContain(
      'authorization-expiring',
    );
    expect(EXPIRY_WARN_DAYS).toBeGreaterThan(0);
  });

  it('notes a missing authorization without treating it as an error', () => {
    const f = reconcilePatient({ program: 'now-comp', serviceLevel: 'rn-oversight' }, TODAY);
    expect(f.map((x) => x.rule)).toEqual(['no-authorization']);
    expect(f[0].severity).toBe('info');
  });

  it('reports which half of the classification is missing', () => {
    expect(reconcilePatient({}, TODAY)[0].message).toBe('No program or service level set.');
    expect(reconcilePatient({ program: 'gapp' }, TODAY)[0].message).toBe('No service level set.');
    expect(reconcilePatient({ serviceLevel: 'rn-oversight' }, TODAY)[0].message).toBe('No program set.');
  });
});

describe('worstSeverity', () => {
  it('ranks error over warn over info, and null when clean', () => {
    expect(worstSeverity([])).toBeNull();
    expect(worstSeverity([{ rule: 'a', severity: 'info', message: '' }])).toBe('info');
    expect(
      worstSeverity([
        { rule: 'a', severity: 'info', message: '' },
        { rule: 'b', severity: 'warn', message: '' },
      ]),
    ).toBe('warn');
    expect(
      worstSeverity([
        { rule: 'a', severity: 'warn', message: '' },
        { rule: 'b', severity: 'error', message: '' },
      ]),
    ).toBe('error');
  });
});

describe('summarize', () => {
  it('counts clients rather than findings, so one bad record cannot dominate', () => {
    const wreck: ReconcileSubject = { requiresMar: false, assignedNurseIds: [] };
    expect(summarize([dailyLpn, dailyLpn, wreck], TODAY)).toEqual({
      error: 0,
      warn: 1,
      info: 0,
      clean: 2,
    });
  });
});
