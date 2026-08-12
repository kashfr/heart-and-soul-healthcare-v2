// Consistency checks between a client's classification, their service
// authorizations, and the flags the rest of the portal keys off.
//
// Why this exists: serviceLevel is hand-entered, and hand-entered fields rot.
// Lahin Lalani sat classified as RN-oversight-only while carrying an NL1 line
// at 3 hours daily, because the classification came from a conversation and
// nobody compared it to the authorization. The data to catch that was already
// in the record; nothing was looking at it.
//
// Pure and Firebase-free so it can run on the roster, in a server route, or in
// a script. `today` is always passed in rather than read from the clock, so the
// rules are deterministic under test.

import { getServiceLevel } from './programs';

/**
 * One line from a Therap Service Authorization. Only the fields that actually
 * drive a decision are modeled; the rest stays in Therap.
 */
export interface PatientAuthorization {
  /** Therap service code, e.g. 'NL1' (Nursing Services - LPN), 'NR1' (RN). */
  serviceCode: string;
  /** 'Daily' | 'Monthly' | 'Weekly' as printed on the authorization. */
  frequency: string;
  /** Service amount, in whatever unit the authorization states (usually hours). */
  amount?: number;
  /** 'YYYY-MM-DD'. */
  from?: string;
  to?: string;
}

export interface ReconcileSubject {
  name?: string;
  program?: string;
  serviceLevel?: string;
  requiresMar?: boolean;
  assignedNurseIds?: string[];
  authorizations?: PatientAuthorization[];
  /**
   * 'YYYY-MM-DD' the day we actually began providing service. Unset means not
   * started yet.
   *
   * An active authorization is NOT a proxy for this: authorizations are put in
   * place proactively, often weeks before the first visit. Keying the
   * "receives daily care but has no MAR" rules off the authorization produced
   * false errors for Danielle Hall and Lahin Lalani, both authorized and
   * neither started.
   */
  serviceStartedOn?: string;
}

export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  /** Stable id so a finding can be referenced or suppressed later. */
  rule: string;
  severity: Severity;
  /** One line, written to be read by a coordinator rather than a developer. */
  message: string;
}

/** Service levels that mean someone is in the home providing care most days. */
const DAILY_CARE_LEVELS = ['rn-lpn-daily', 'skilled-nursing-shifts'];

/** An LPN line at daily frequency is the marker for daily LPN staffing. */
function isDailyLpn(a: PatientAuthorization): boolean {
  return a.serviceCode.toUpperCase().startsWith('NL') && /daily/i.test(a.frequency);
}

function isActive(a: PatientAuthorization, today: string): boolean {
  if (a.from && a.from > today) return false;
  if (a.to && a.to < today) return false;
  return true;
}

/** Days between two ISO dates, positive when `to` is in the future. */
function daysUntil(to: string, today: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/** Authorizations expiring within this many days are worth surfacing early. */
export const EXPIRY_WARN_DAYS = 45;

/**
 * Check one client. Returns an empty array when everything lines up.
 *
 * Rules that depend on someone actually being served (no MAR, no care team)
 * only fire once serviceStartedOn has passed. An authorization is set up
 * proactively and is not evidence of service, so a client who is authorized but
 * has not started legitimately has neither, and firing on them would train
 * people to ignore the warnings.
 */
export function reconcilePatient(p: ReconcileSubject, today: string): Finding[] {
  const out: Finding[] = [];
  const auths = p.authorizations ?? [];
  const active = auths.filter((a) => isActive(a, today));
  const authActive = active.length > 0;
  // Only an explicit start date means service is underway. See serviceStartedOn.
  const started = Boolean(p.serviceStartedOn && p.serviceStartedOn <= today);

  if (!p.program || !p.serviceLevel) {
    out.push({
      rule: 'unclassified',
      severity: 'warn',
      message: !p.program && !p.serviceLevel
        ? 'No program or service level set.'
        : !p.program
          ? 'No program set.'
          : 'No service level set.',
    });
  }

  // Classification vs authorization, in both directions.
  const authSaysDailyLpn = active.some(isDailyLpn);
  if (authSaysDailyLpn && p.serviceLevel && p.serviceLevel !== 'rn-lpn-daily') {
    out.push({
      rule: 'auth-says-daily-lpn',
      severity: 'error',
      message: `Has an active daily LPN authorization but is classified "${
        getServiceLevel(p.serviceLevel)?.label ?? p.serviceLevel
      }".`,
    });
  }
  if (!authSaysDailyLpn && p.serviceLevel === 'rn-lpn-daily' && authActive) {
    out.push({
      rule: 'no-daily-lpn-auth',
      severity: 'error',
      message: 'Classified daily LPN but has no active daily LPN authorization on file.',
    });
  }

  // Flags the rest of the portal keys off, checked only once care has started.
  if (started && DAILY_CARE_LEVELS.includes(p.serviceLevel ?? '') && !p.requiresMar) {
    out.push({
      rule: 'daily-care-no-mar',
      severity: 'error',
      message: 'Receives daily direct care but is not flagged as requiring a MAR.',
    });
  }
  if (started && DAILY_CARE_LEVELS.includes(p.serviceLevel ?? '') && (p.assignedNurseIds ?? []).length === 0) {
    out.push({
      rule: 'daily-care-no-care-team',
      severity: 'warn',
      message: 'Receives daily direct care but has no one on the care team.',
    });
  }

  // Authorization lifecycle.
  if (auths.length === 0) {
    out.push({
      rule: 'no-authorization',
      severity: 'info',
      message: 'No service authorization recorded.',
    });
  } else if (!authActive) {
    const upcoming = auths.filter((a) => a.from && a.from > today);
    out.push(
      upcoming.length > 0
        ? {
            rule: 'authorization-not-started',
            severity: 'info',
            message: `Authorization has not started yet (begins ${upcoming[0].from}).`,
          }
        : {
            rule: 'authorization-expired',
            severity: 'error',
            message: 'All service authorizations have expired.',
          },
    );
  } else {
    const soonest = active
      .filter((a) => a.to)
      .map((a) => ({ to: a.to!, days: daysUntil(a.to!, today) }))
      .sort((a, b) => a.days - b.days)[0];
    if (soonest && soonest.days <= EXPIRY_WARN_DAYS) {
      out.push({
        rule: 'authorization-expiring',
        severity: 'warn',
        message: `Service authorization expires ${soonest.to} (${soonest.days} day${
          soonest.days === 1 ? '' : 's'
        }).`,
      });
    }
  }

  return out;
}

/** Highest severity present, or null when there are no findings. */
export function worstSeverity(findings: Finding[]): Severity | null {
  if (findings.some((f) => f.severity === 'error')) return 'error';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  if (findings.some((f) => f.severity === 'info')) return 'info';
  return null;
}

/**
 * Roster summary: how many clients have at least one finding at each severity.
 * Counts CLIENTS, not findings, so one badly-broken record cannot dominate.
 */
export function summarize(
  subjects: ReconcileSubject[],
  today: string,
): { error: number; warn: number; info: number; clean: number } {
  const acc = { error: 0, warn: 0, info: 0, clean: 0 };
  for (const s of subjects) {
    const w = worstSeverity(reconcilePatient(s, today));
    if (w === null) acc.clean += 1;
    else acc[w] += 1;
  }
  return acc;
}
