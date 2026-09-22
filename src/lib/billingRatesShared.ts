// Rate lookup for the dollar views. Firebase-free so the list, the Hours
// tab, and tests share one resolver.

import type { HoursBucket } from './shiftHours';

export interface RateRow {
  program: string;
  bucket: HoursBucket;
  ratePerUnit: number;
  effectiveFrom: string;
  effectiveTo: string;
}

/**
 * The rate in force for a program + bucket on a date: the row whose window
 * contains the date; when several do (an overlap during a rate change), the
 * one that started most recently. null when nothing matches.
 */
export function resolveRate(rates: RateRow[], program: string, bucket: HoursBucket, dateISO: string): number | null {
  if (!program || !dateISO) return null;
  let best: RateRow | null = null;
  for (const r of rates) {
    if (r.program !== program || r.bucket !== bucket) continue;
    if (r.effectiveFrom && r.effectiveFrom > dateISO) continue;
    if (r.effectiveTo && r.effectiveTo < dateISO) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best ? best.ratePerUnit : null;
}

/** Programs that have at least one rate row. */
export function programsWithRates(rates: RateRow[]): Set<string> {
  return new Set(rates.map((r) => r.program));
}
