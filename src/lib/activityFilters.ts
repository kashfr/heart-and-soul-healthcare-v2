export interface ActivityFilters { client?: string; from?: string; through?: string; type?: string }
export function parseActivityUSDate(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return validActivityDate(iso) ? iso : null;
}
function validActivityDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && +value.slice(0, 4) >= 1900 &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
/** Midnight in New York, including each day's own daylight-saving offset. */
function midnight(date: Date): Date {
  const utc = date.getTime();
  const noon = new Date(utc + 12 * 3600000);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).formatToParts(noon);
  const offset = Number(parts.find(p => p.type === 'hour')!.value) - 12;
  // At DST transitions midnight still uses the prior offset; refine using the candidate.
  let candidate = utc - offset * 3600000;
  for (let i = 0; i < 2; i++) {
    const local = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(candidate));
    const part = (key: string) => Number(local.find(p => p.type === key)!.value);
    const represented = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'));
    candidate += utc - represented;
  }
  return new Date(candidate);
}
export function activityDateBounds(from?: string, through?: string): { start?: Date; end?: Date } {
  if ((from && !validActivityDate(from)) || (through && !validActivityDate(through))) throw new Error('Enter valid dates in MM/DD/YYYY format.');
  if (from && through && from > through) throw new Error('From date must be on or before Through date.');
  const next = through ? new Date(through) : undefined;
  if (next) next.setUTCDate(next.getUTCDate() + 1);
  return { start: from ? midnight(new Date(from)) : undefined, end: next ? midnight(next) : undefined };
}

export const ACTIVITY_TYPES = [
  { value: 'uploads', label: 'Document uploads' },
  { value: 'information', label: 'Client information updates' },
  { value: 'undo', label: 'Undo actions' },
] as const;
export function activityTypeActions(type?: string): string[] | undefined {
  if (!type) return undefined;
  if (type === 'uploads') return ['assistant-document-upload', 'record-created'];
  if (type === 'information') return ['assistant-information-update', 'record-updated'];
  if (type === 'undo') return ['admin-undo'];
  throw new Error('Invalid activity change type.');
}
export function matchesActivityType(entry: { action?: string; sourcePath?: string }, type?: string): boolean {
  if (!type) return true;
  if (type === 'undo') return entry.action === 'admin-undo';
  if (type === 'uploads') return entry.action === 'assistant-document-upload' ||
    (entry.action === 'record-created' && /^patientDocuments\/[^/]+$/.test(entry.sourcePath || ''));
  if (type === 'information') return entry.action === 'assistant-information-update' ||
    (entry.action === 'record-updated' && /^patients\/[^/]+(?:\/clinical\/(?:profile|guardian))?$/.test(entry.sourcePath || ''));
  return false;
}
