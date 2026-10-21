import { formatDateUSFile } from '@/lib/dateFormat';
import type { Referral } from './types';

/** YYYY-MM-DD for an ISO timestamp, in the agency's time zone. */
function agencyDate(iso: string | null | undefined, now: Date): string {
  const d = iso ? new Date(iso) : now;
  const day = Number.isNaN(d.getTime()) ? now : d;
  return day.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/** Characters macOS, Windows, or Chrome refuse in a file name. */
function safe(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The name Chrome offers when a call sheet is saved as a PDF. Chrome uses the
 * page title, which was the same site title for every referral, so each save
 * collided with the last. One referral: "Paisley Wiggins Call Sheet
 * 10-06-2026" (the date it was received). Several: "Referral Call Sheets (3)
 * 10-06-2026" (the date printed).
 */
export function callSheetFileName(list: Referral[], now: Date = new Date()): string {
  if (list.length === 1) {
    const r = list[0];
    const name = safe(r.clientName || '') || 'Referral';
    return `${name} Call Sheet ${formatDateUSFile(agencyDate(r.submittedAt, now))}`;
  }
  return `Referral Call Sheets (${list.length}) ${formatDateUSFile(agencyDate(null, now))}`;
}
