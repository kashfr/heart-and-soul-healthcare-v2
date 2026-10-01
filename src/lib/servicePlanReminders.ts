/**
 * Service plan reminders: when to send, to whom, and what the messages say.
 * Pure (no Firebase), so the rules are unit-tested; the daily sweep that
 * reads Firestore and sends lives in servicePlanRemindersServer.ts.
 *
 * A client needs a reminder when the plan is missing, overdue, or due within
 * 7 days (servicePlanStatus with soonDays 7). Each client is reminded once
 * when it enters a stage (or its due date moves), and again every 7 days
 * while it stays overdue or missing. Email is PHI-free (counts and a portal
 * link only); the portal bell, behind the login, names the clients.
 */
import { addDaysISO, needsServicePlanAction, servicePlanStatusLabel, type ServicePlanStage } from './servicePlanShared';

export const SERVICE_PLAN_REMINDER_SOON_DAYS = 7;
export const SERVICE_PLAN_REMINDER_REPEAT_DAYS = 7;

export interface ReminderState {
  stage: string;
  dueISO: string;
  /** Agency date the last reminder went out; '' when none has. */
  lastSentISO: string;
}

export function shouldSendServicePlanReminder(prev: ReminderState | null, cur: { stage: ServicePlanStage; dueISO: string }, todayISO: string): boolean {
  if (!needsServicePlanAction(cur.stage)) return false;
  if (!prev || !prev.lastSentISO) return true;
  if (prev.stage !== cur.stage || prev.dueISO !== cur.dueISO) return true;
  // "Due soon" is said once per due date; overdue and missing repeat weekly.
  if (cur.stage === 'due-soon') return false;
  return addDaysISO(prev.lastSentISO, SERVICE_PLAN_REMINDER_REPEAT_DAYS) <= todayISO;
}

/**
 * Who hears about a client: whoever is scheduled for the next supervisory
 * visit, else whoever did the last one, else the admins. Only active
 * supervisors and admins count; anyone else falls through.
 */
export function pickServicePlanReminderRecipients(p: {
  nextVisitNurseId: string;
  lastVisitAuthorId: string;
  eligible: ReadonlySet<string>;
  admins: string[];
}): string[] {
  if (p.nextVisitNurseId && p.eligible.has(p.nextVisitNurseId)) return [p.nextVisitNurseId];
  if (p.lastVisitAuthorId && p.eligible.has(p.lastVisitAuthorId)) return [p.lastVisitAuthorId];
  return [...p.admins];
}

export interface ReminderItem {
  patientId: string;
  clientName: string;
  stage: ServicePlanStage;
  dueISO: string;
}

/** Portal bell for one client (behind the login, so it names the client). */
export function servicePlanBellText(item: ReminderItem): string {
  const status = servicePlanStatusLabel(item.stage, item.dueISO);
  return item.stage === 'none'
    ? `Service plan needed for ${item.clientName}: ${status.toLowerCase()}.`
    : `Service plan for ${item.clientName}: ${status.toLowerCase()}. Review or revise it at the next visit.`;
}

const PORTAL_URL = 'https://www.heartandsoulhc.org/login';

/** The PHI-free digest email: counts by stage and a portal link, no client names. */
export function servicePlanReminderEmail(items: ReminderItem[], firstName: string): { subject: string; body: string } {
  const n = (stage: ServicePlanStage) => items.filter((i) => i.stage === stage).length;
  const parts: string[] = [];
  if (n('overdue')) parts.push(`${n('overdue')} overdue`);
  if (n('due-soon')) parts.push(`${n('due-soon')} due within ${SERVICE_PLAN_REMINDER_SOON_DAYS} days`);
  if (n('none')) parts.push(`${n('none')} with no service plan on file`);
  const total = items.length;
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] || '';
  const subject = total === 1 ? 'A Service Plan Needs Attention' : `${total} Service Plans Need Attention`;
  const body = [
    firstName ? `Hi ${firstName},` : 'Hi,',
    `${total === 1 ? "One client's service plan needs" : `${total} clients' service plans need`} attention: ${list}.`,
    'Nursing service plans are reviewed and updated at least every 62 days. You can review or revise a plan during the next supervisory visit; the visit form will ask about it.',
    `To see which clients, sign in to the staff portal (client information is never included in email or text): ${PORTAL_URL}`,
    'Heart and Soul Healthcare',
  ].join('\n\n');
  return { subject, body };
}

/** Past this many clients a recipient gets one bell listing them, not one each. */
export const SERVICE_PLAN_BELL_DIGEST_AFTER = 3;

/** One bell for a long list (behind the login, so it names the clients). */
export function servicePlanDigestBellText(items: ReminderItem[]): string {
  const label = (i: ReminderItem) => `${i.clientName} (${servicePlanStatusLabel(i.stage, i.dueISO).toLowerCase()})`;
  return `Service plans need attention for ${items.length} clients: ${[...items].sort((a, b) => a.clientName.localeCompare(b.clientName)).map(label).join('; ')}.`;
}
