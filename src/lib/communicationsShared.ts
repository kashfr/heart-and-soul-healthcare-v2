/**
 * Communications log: every notice the portal sends a staff member about a
 * client's care (visit assigned, cancelled, back on the schedule, reminders),
 * with the exact wording of each channel, plus messages staff log by hand
 * (an email sent from Outlook, a phone call, a text). Pure module: types,
 * labels, and manual-entry validation shared by the API, the UI and tests.
 */

export const COMM_CHANNELS = [
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'Text message' },
  { key: 'portal', label: 'Portal notification' },
  { key: 'phone', label: 'Phone call' },
  { key: 'in-person', label: 'In person' },
  { key: 'fax', label: 'Fax' },
  { key: 'other', label: 'Other' },
] as const;
export type CommChannel = (typeof COMM_CHANNELS)[number]['key'];

/** Channels a person can pick when logging by hand (the portal logs its own). */
export const MANUAL_CHANNELS: readonly CommChannel[] = ['email', 'sms', 'phone', 'in-person', 'fax', 'other'];

export const channelLabel = (c: string): string => COMM_CHANNELS.find((x) => x.key === c)?.label || c;

export type CommDirection = 'outbound' | 'inbound';

/** One channel of one communication, with exactly what was sent on it. */
export interface CommChannelResult {
  channel: CommChannel;
  /** Email address, phone number, or the person's name for a portal notice. */
  to: string;
  ok: boolean;
  /** Not attempted (no number on file, channel not configured). */
  skipped?: boolean;
  error?: string;
  subject?: string;
  body: string;
}

export interface CommunicationEntry {
  id: string;
  source: 'automated' | 'manual';
  /** 'visit-assigned', 'visit-reminder-tomorrow', ... or 'manual'. */
  event: string;
  direction: CommDirection;
  /** '' when it is not about one client. */
  patientId: string;
  patientName: string;
  /** The staff member it went to (or came from, when inbound). */
  staffUid: string;
  staffName: string;
  /** Someone outside the staff list: a parent, a physician's office. */
  counterpartyName: string;
  /** One line for the list. */
  summary: string;
  channels: CommChannelResult[];
  relatedVisitId: string;
  /** ISO; when it was sent or happened. */
  occurredAt: string;
  loggedByUid: string;
  loggedByName: string;
}

export const COMM_EVENT_LABEL: Record<string, string> = {
  'visit-assigned': 'Visit assigned',
  'visit-cancelled': 'Visit cancelled',
  'visit-restored': 'Visit back on the schedule',
  'visit-reminder': 'Visit reminder (day of)',
  'visit-reminder-tomorrow': 'Visit reminder (day before)',
  manual: 'Logged by hand',
};
export const eventLabel = (e: string): string => COMM_EVENT_LABEL[e] || e;

/** Every channel attempted failed or was skipped: nobody got it. */
export function deliveryStatus(e: Pick<CommunicationEntry, 'channels'>): 'delivered' | 'partial' | 'failed' {
  const ok = e.channels.filter((c) => c.ok).length;
  if (ok === e.channels.length) return 'delivered';
  return ok === 0 ? 'failed' : 'partial';
}

export interface ManualCommInput {
  direction: CommDirection | '';
  channel: CommChannel | '';
  /** Pick a staff member, or name someone else. */
  staffUid: string;
  counterpartyName: string;
  patientId: string;
  subject: string;
  body: string;
  /** 'YYYY-MM-DDTHH:MM', agency time. */
  occurredAt: string;
}

export const EMPTY_MANUAL_COMM: ManualCommInput = {
  direction: 'outbound',
  channel: '',
  staffUid: '',
  counterpartyName: '',
  patientId: '',
  subject: '',
  body: '',
  occurredAt: '',
};

export type ManualCommErrorKey = 'channel' | 'who' | 'body' | 'occurredAt';
export const MANUAL_COMM_ERROR_ORDER: readonly ManualCommErrorKey[] = ['channel', 'who', 'occurredAt', 'body'];
export const MANUAL_COMM_TEXT_MAX = 20000;

/** `nowLocal` is agency-local 'YYYY-MM-DDTHH:MM' (a few minutes of grace is the caller's job). */
export function validateManualComm(m: ManualCommInput, nowLocal: string): Partial<Record<ManualCommErrorKey, string>> {
  const e: Partial<Record<ManualCommErrorKey, string>> = {};
  if (!MANUAL_CHANNELS.includes(m.channel as CommChannel)) e.channel = 'Choose how it was sent.';
  if (!m.staffUid.trim() && !m.counterpartyName.trim()) e.who = 'Choose a staff member or type who it was with.';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(m.occurredAt)) e.occurredAt = 'Enter when it was sent.';
  else if (m.occurredAt > nowLocal) e.occurredAt = 'That time is in the future.';
  if (m.body.trim().length < 2) e.body = 'Paste or type what was said.';
  return e;
}

export function sanitizeManualComm(raw: unknown): ManualCommInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (k: string, max: number) => String(r[k] ?? '').slice(0, max);
  const channel = s('channel', 20);
  return {
    direction: r.direction === 'inbound' ? 'inbound' : 'outbound',
    channel: (MANUAL_CHANNELS as readonly string[]).includes(channel) ? (channel as CommChannel) : '',
    staffUid: s('staffUid', 128).trim(),
    counterpartyName: s('counterpartyName', 200).trim(),
    patientId: s('patientId', 128).trim(),
    subject: s('subject', 300),
    body: s('body', MANUAL_COMM_TEXT_MAX),
    occurredAt: s('occurredAt', 16),
  };
}

/** Agency-local (America/New_York) 'YYYY-MM-DDTHH:MM', optionally shifted. */
export function agencyNowLocal(offsetMs = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(Date.now() + offsetMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

/** Agency-local 'YYYY-MM-DDTHH:MM' to an ISO instant (handles EST/EDT). */
export function agencyLocalToISO(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return '';
  const asUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // What New York's wall clock reads at that UTC instant tells us the offset.
  const probe = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(asUTC));
  const g = (t: string) => Number(probe.find((p) => p.type === t)?.value || 0);
  const wall = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') === 24 ? 0 : g('hour'), g('minute'));
  return new Date(asUTC + (asUTC - wall)).toISOString();
}
