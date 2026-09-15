/**
 * Handoff: nurse-to-nurse cross communication on a client. Pure helpers
 * (no Firebase import) so both the browser, the API route, and vitest can
 * share them.
 *
 * A handoff is a message posted to a client's board by an outgoing nurse
 * (or by staff) and addressed to every OTHER nurse on that client's care
 * team at the moment it is posted. Each recipient acknowledges it once; the
 * acknowledgment is a timestamped read receipt, which is what turns a chat
 * message into a clinical handoff. The post text is immutable — a mistake
 * is corrected with a follow-up post — and only the self-acknowledgment
 * fields may ever change (firestore.rules).
 */

export const HANDOFF_TEXT_MAX = 4000;

export type HandoffSource = 'note' | 'board';

export interface Handoff {
  id?: string;
  patientId: string;
  /** Denormalized for the inbox list (behind the login, so naming is fine). */
  patientName: string;
  authorId: string;
  authorName: string;
  authorCredential: string;
  text: string;
  urgent: boolean;
  /** 'note' = auto-posted from a progress note's next-shift plan; 'board' = typed on the client board. */
  source: HandoffSource;
  sourceNoteId: string;
  /** YYYY-MM-DD the message is about (the note's date of service), or ''. */
  shiftDate: string;
  /** Care-team nurses at post time, minus the author. Never changes. */
  recipientIds: string[];
  /** uid -> display name at post time, so the board can show who still owes an acknowledgment. */
  recipientNames: Record<string, string>;
  /** recipientIds minus everyone who has acknowledged. Shrinks as acks arrive. */
  pendingIds: string[];
  /** uid -> server timestamp of the acknowledgment. */
  acks: Record<string, unknown>;
  createdAt?: unknown;
}

/** Everyone on the care team except the author, de-duplicated, blanks dropped. */
export function computeHandoffRecipients(assignedNurseIds: unknown, authorId: string): string[] {
  const ids = Array.isArray(assignedNurseIds) ? assignedNurseIds : [];
  const out: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || id === authorId || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Whether a next-shift-plan field is worth turning into a handoff post.
 * Nurses routinely type "N/A" or "none" into the plan box; those must not
 * ring every colleague's bell.
 */
export function isSubstantiveHandoffText(raw: unknown): boolean {
  const t = String(raw ?? '').trim();
  if (!t) return false;
  const norm = t.toLowerCase().replace(/[.\s]+$/g, '');
  return !['n/a', 'na', 'n.a', 'none', 'no', 'nothing', '-', '--', 'nil', 'same', 'n/a.'].includes(norm);
}

export function normalizeHandoffText(raw: unknown): string {
  return String(raw ?? '').replace(/\r\n/g, '\n').trim().slice(0, HANDOFF_TEXT_MAX);
}

/** Bell text (in-portal, may name the client). */
export function handoffBellText(params: { clientName: string; authorName: string; urgent: boolean }): string {
  const who = params.authorName || 'a team member';
  const client = params.clientName || 'a client';
  return params.urgent ? `Urgent handoff for ${client} from ${who}` : `Handoff for ${client} from ${who}`;
}

/** SMS body: PHI-free by design (SMS is outside the Quo BAA). Only sent for urgent posts. */
export function handoffSmsText(): string {
  return 'Heart and Soul: an urgent handoff from another nurse is waiting for you. Please sign in to read and acknowledge it: https://www.heartandsoulhc.org/login Reply STOP to opt out.';
}

export function isAcknowledgedBy(h: Pick<Handoff, 'acks'>, uid: string): boolean {
  return !!uid && !!h.acks && Object.prototype.hasOwnProperty.call(h.acks, uid);
}

export function isPendingFor(h: Pick<Handoff, 'pendingIds'>, uid: string): boolean {
  return !!uid && Array.isArray(h.pendingIds) && h.pendingIds.includes(uid);
}

export interface HandoffAckSummary {
  total: number;
  acknowledged: number;
  pendingNames: string[];
}

export function summarizeAcks(h: Pick<Handoff, 'recipientIds' | 'recipientNames' | 'pendingIds'>): HandoffAckSummary {
  const total = h.recipientIds?.length || 0;
  const pending = Array.isArray(h.pendingIds) ? h.pendingIds : [];
  return {
    total,
    acknowledged: Math.max(0, total - pending.length),
    pendingNames: pending.map((uid) => h.recipientNames?.[uid] || 'a nurse'),
  };
}
