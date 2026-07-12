/**
 * Pure message composers for visit-assignment notifications (SMS + email).
 *
 * PHI-FREE BY CONSTRUCTION: SMS is not covered by the Quo BAA and email is
 * kept PHI-free by policy, so these composers only accept the visit's date,
 * time, and type — there is deliberately NO parameter for the client's name,
 * address, or anything else about them. Client details live behind the portal
 * login; the messages link there.
 */

export type VisitNotifyEvent =
  | 'assigned'
  | 'cancelled'
  | 'restored'
  | 'reminder' // day-of nudge (sent the morning of the visit)
  | 'reminder_tomorrow'; // evening-before reminder (sent ~6 PM the prior day)

export interface VisitNotifyFacts {
  date: string; // YYYY-MM-DD
  startTime?: string; // 'HH:MM' 24h, optional
  type: 'shift' | 'supervisory';
}

export const PORTAL_LOGIN_URL = 'https://www.heartandsoulhc.org/login';

/** 'Thu, Jul 10' — timezone-safe for a plain calendar date. */
export function friendlyDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** '10:00 AM', or '' when no start time was set. */
export function friendlyTime(hhmm?: string): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function visitTypeLabel(type: VisitNotifyFacts['type']): string {
  return type === 'supervisory' ? 'supervisory visit' : 'shift visit';
}

/** 'HH:MM' 24h → minutes past midnight, or null when unset/unparseable. */
export function startTimeMinutes(hhmm?: string): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Early shifts get their useful reminder the EVENING BEFORE; a 7 AM day-of
 * text for a 5:00 or 7:30 start would land after (or minutes before) the
 * shift began. The day-of nudge therefore only goes to visits starting at
 * or after this cutoff. Visits with no/unparseable start time skip the
 * nudge too — they were covered by the evening-before reminder.
 */
export const MORNING_NUDGE_CUTOFF_MINUTES = 9 * 60 + 30; // 9:30 AM

export function needsMorningNudge(startTime?: string): boolean {
  const mins = startTimeMinutes(startTime);
  return mins !== null && mins >= MORNING_NUDGE_CUTOFF_MINUTES;
}

/** 'Thu, Jul 10 at 10:00 AM' (time omitted when not set). */
export function whenPhrase(facts: VisitNotifyFacts): string {
  const t = friendlyTime(facts.startTime);
  return t ? `${friendlyDate(facts.date)} at ${t}` : friendlyDate(facts.date);
}

export function visitSmsBody(event: VisitNotifyEvent, facts: VisitNotifyFacts): string {
  const what = visitTypeLabel(facts.type);
  const when = whenPhrase(facts);
  switch (event) {
    case 'assigned':
      return `Heart & Soul Healthcare: a ${what} was assigned to you for ${when}. Sign in for client details: ${PORTAL_LOGIN_URL}`;
    case 'cancelled':
      return `Heart & Soul Healthcare: your ${what} on ${when} was cancelled. Questions? Check the portal: ${PORTAL_LOGIN_URL}`;
    case 'restored':
      return `Heart & Soul Healthcare: your ${what} on ${when} is back on the schedule. Sign in for client details: ${PORTAL_LOGIN_URL}`;
    case 'reminder':
      return `Heart & Soul Healthcare reminder: you have a ${what} today, ${when}. Sign in for client details: ${PORTAL_LOGIN_URL}`;
    case 'reminder_tomorrow':
      return `Heart & Soul Healthcare reminder: you have a ${what} tomorrow, ${when}. Sign in for client details: ${PORTAL_LOGIN_URL}`;
  }
}

export function visitEmailSubject(event: VisitNotifyEvent, facts: VisitNotifyFacts): string {
  const when = friendlyDate(facts.date);
  switch (event) {
    case 'assigned':
      return `New ${visitTypeLabel(facts.type)} assigned: ${when}`;
    case 'cancelled':
      return `Visit cancelled: ${when}`;
    case 'restored':
      return `Visit back on the schedule: ${when}`;
    case 'reminder':
      return `Visit reminder for today: ${when}`;
    case 'reminder_tomorrow':
      return `Visit reminder for tomorrow: ${when}`;
  }
}

/** Plain-text email body (the HTML wrapper is styled server-side). */
export function visitEmailBody(
  event: VisitNotifyEvent,
  facts: VisitNotifyFacts,
  recipientFirstName: string,
): string {
  const greeting = recipientFirstName ? `Hi ${recipientFirstName},` : 'Hi,';
  const what = visitTypeLabel(facts.type);
  const when = whenPhrase(facts);
  const line =
    event === 'assigned'
      ? `A ${what} was assigned to you for ${when}.`
      : event === 'cancelled'
        ? `Your ${what} on ${when} was cancelled.`
        : event === 'reminder'
          ? `A reminder: you have a ${what} today, ${when}.`
          : event === 'reminder_tomorrow'
            ? `A reminder: you have a ${what} tomorrow, ${when}.`
            : `Your ${what} on ${when} is back on the schedule.`;
  return `${greeting}\n\n${line}\n\nFor the client's name and details, sign in to the staff portal (client information is never included in email or text): ${PORTAL_LOGIN_URL}\n\nHeart and Soul Healthcare`;
}
