// Rate lookup for the dollar views. Firebase-free so the list, the Hours
// tab, and tests share one resolver.

import type { HoursBucket } from './shiftHours';

/** Nurse types a rate row can be limited to; '' = any credential. */
export const RATE_CREDENTIALS = ['', 'LPN', 'RN', 'HHA', 'CNA'] as const;
export type RateCredential = (typeof RATE_CREDENTIALS)[number];

export interface RateRow {
  program: string;
  bucket: HoursBucket;
  /** '' = applies to any nurse type; otherwise only notes by that credential. */
  credential: string;
  ratePerUnit: number;
  effectiveFrom: string;
  effectiveTo: string;
}

/** Normalize a note's credential for matching ('lpn' -> 'LPN'). */
export function normalizeCredential(v: string | undefined): string {
  return (v || '').trim().toUpperCase();
}

/**
 * The rate row in force for a program + bucket on a date for a nurse of the
 * given credential. GAPP pays LPN and RN shifts differently, so a row
 * limited to the note author's credential wins; otherwise a row for any
 * credential applies. Among candidates the most recently started row wins
 * (an overlap during a rate change). null when nothing matches.
 */
export function resolveRateRow<T extends RateRow>(
  rates: T[],
  program: string,
  bucket: HoursBucket,
  dateISO: string,
  credential: string = '',
): T | null {
  if (!program || !dateISO) return null;
  const cred = normalizeCredential(credential);
  let best: T | null = null;
  let bestSpecific = false;
  for (const r of rates) {
    if (r.program !== program || r.bucket !== bucket) continue;
    if (r.effectiveFrom && r.effectiveFrom > dateISO) continue;
    if (r.effectiveTo && r.effectiveTo < dateISO) continue;
    const rc = normalizeCredential(r.credential);
    if (rc && rc !== cred) continue;
    const specific = rc !== '';
    if (!best || (specific && !bestSpecific) || (specific === bestSpecific && r.effectiveFrom > best.effectiveFrom)) {
      best = r;
      bestSpecific = specific;
    }
  }
  return best;
}

export function resolveRate(rates: RateRow[], program: string, bucket: HoursBucket, dateISO: string, credential: string = ''): number | null {
  return resolveRateRow(rates, program, bucket, dateISO, credential)?.ratePerUnit ?? null;
}

/** Programs that have at least one rate row. */
export function programsWithRates(rates: RateRow[]): Set<string> {
  return new Set(rates.map((r) => r.program));
}
