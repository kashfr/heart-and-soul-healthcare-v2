import type { Role } from './auth';

/**
 * Portal announcements ("What's new"): a short, structured message the admin
 * publishes to a role audience. Each recipient sees it as a blocking modal the
 * next time she lands in the portal or on the progress note, and must click
 * through; the click is recorded per user so the office can see who has and
 * has not read it. Announcements are never edited after publishing; the
 * office retires them (active=false) instead, so an acknowledgment always
 * refers to the text the reader actually saw.
 */

export const ANNOUNCEMENT_ROLES: readonly Role[] = ['nurse', 'supervisor', 'admin', 'va'];

export const ANNOUNCEMENT_ROLE_LABELS: Record<Role, string> = {
  nurse: 'Nurses',
  supervisor: 'Supervisors',
  admin: 'Admins',
  va: 'Virtual assistants',
};

export const MAX_ANNOUNCEMENT_ITEMS = 8;
export const MAX_TITLE_LENGTH = 80;
export const MAX_LABEL_LENGTH = 40;
export const MAX_TEXT_LENGTH = 240;
export const MAX_FOOTER_LENGTH = 200;

export interface AnnouncementItem {
  /** Bold lead-in, e.g. "Seizure log." */
  label: string;
  /** One or two plain sentences: what to do and where. */
  text: string;
}

export interface AnnouncementInput {
  title: string;
  items: AnnouncementItem[];
  /** Optional closing line under the list. */
  footer: string;
  audience: Role[];
}

export interface AnnouncementAck {
  at: unknown;
  name: string;
}

export interface Announcement extends AnnouncementInput {
  id: string;
  active: boolean;
  publishedAt: unknown;
  publishedBy: string;
  publishedByName: string;
  /** uid -> { at, name }. Written server-side only. */
  acks: Record<string, AnnouncementAck>;
  ackCount: number;
  retiredAt?: unknown;
  retiredBy?: string;
}

export type AnnouncementField = 'title' | `item-${number}-label` | `item-${number}-text` | 'footer' | 'audience';

export function announcementFieldOrder(itemCount: number): AnnouncementField[] {
  const order: AnnouncementField[] = ['title'];
  for (let i = 0; i < itemCount; i++) order.push(`item-${i}-label`, `item-${i}-text`);
  order.push('footer', 'audience');
  return order;
}

/** Per-field messages, keyed so the compose form can escort to each one. */
export function validateAnnouncementInput(input: AnnouncementInput): Partial<Record<AnnouncementField, string>> {
  const e: Partial<Record<AnnouncementField, string>> = {};
  const title = input.title.trim();
  if (!title) e.title = 'Give the announcement a short title, for example "What\'s new in the portal".';
  else if (title.length > MAX_TITLE_LENGTH) e.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`;

  const items = input.items;
  const filled = items.filter((it) => it.label.trim() || it.text.trim());
  if (filled.length === 0) e['item-0-label'] = 'Add at least one item: a bold lead-in and one or two sentences.';
  if (filled.length > MAX_ANNOUNCEMENT_ITEMS) e[`item-${MAX_ANNOUNCEMENT_ITEMS}-label`] = `Keep it to ${MAX_ANNOUNCEMENT_ITEMS} items; a modal is one screen.`;
  items.forEach((it, i) => {
    const label = it.label.trim();
    const text = it.text.trim();
    if (!label && !text) return; // empty rows are dropped on save
    if (!label) e[`item-${i}-label`] = 'Give this item a bold lead-in, for example "Handoffs."';
    else if (label.length > MAX_LABEL_LENGTH) e[`item-${i}-label`] = `Keep the lead-in under ${MAX_LABEL_LENGTH} characters.`;
    if (!text) e[`item-${i}-text`] = 'Say what to do and where, in one or two sentences.';
    else if (text.length > MAX_TEXT_LENGTH) e[`item-${i}-text`] = `Keep this under ${MAX_TEXT_LENGTH} characters so the modal fits one screen.`;
  });

  if (input.footer.trim().length > MAX_FOOTER_LENGTH) e.footer = `Keep the closing line under ${MAX_FOOTER_LENGTH} characters.`;

  const audience = input.audience.filter((r) => ANNOUNCEMENT_ROLES.includes(r));
  if (audience.length === 0) e.audience = 'Choose at least one audience.';
  return e;
}

/** Normalised copy of the input: trimmed, empty items dropped, audience deduped. */
export function normalizeAnnouncementInput(input: AnnouncementInput): AnnouncementInput {
  return {
    title: input.title.trim(),
    items: input.items
      .map((it) => ({ label: it.label.trim(), text: it.text.trim() }))
      .filter((it) => it.label || it.text),
    footer: input.footer.trim(),
    audience: Array.from(new Set(input.audience.filter((r) => ANNOUNCEMENT_ROLES.includes(r)))),
  };
}

export function isAcknowledgedBy(a: Pick<Announcement, 'acks'>, uid: string): boolean {
  return !!a.acks && Object.prototype.hasOwnProperty.call(a.acks, uid);
}

/** The announcements a given user still owes a click on, oldest first. */
export function pendingAnnouncementsFor(list: Announcement[], uid: string | null, role: Role | null): Announcement[] {
  if (!uid || !role) return [];
  return list
    .filter((a) => a.active && a.audience.includes(role) && !isAcknowledgedBy(a, uid))
    .sort((x, y) => toMillis(x.publishedAt) - toMillis(y.publishedAt));
}

export function toMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}
