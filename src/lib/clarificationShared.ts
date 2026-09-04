import type { Timestamp } from 'firebase/firestore';
import type { Role } from './auth';

/**
 * Clarification / correction flag types and the pure predicates over them.
 * Firebase-free (type-only imports) so the nurse gate, both nav badges, the
 * server fan-out, and unit tests all read a thread the same way.
 * submissions.ts re-exports everything here for its existing importers.
 */

/**
 * One message in a clarification conversation. The thread is append-only; a
 * reviewer message (byRole !== 'nurse') awaiting a nurse reply is what drives
 * the nurse's blocking gate.
 */
export interface ClarificationMessage {
  by: string;        // author uid
  byName: string;
  byRole: Role;      // 'admin' | 'supervisor' | 'nurse'
  text: string;
  at?: Timestamp | null;
}

/**
 * The intent of a flag:
 *  - 'clarification' = a non-adversarial question for the author.
 *  - 'correction'    = something is wrong and must be fixed (e.g. wrong date).
 * Same blocking + reply + resolve machinery; only the label, tone, and color
 * differ. Defaults to 'clarification' for any flag written before this field.
 */
export type ClarificationKind = 'clarification' | 'correction';

/**
 * "Flag for clarification" thread on a note. A reviewer raises a question, the
 * author and reviewers go back and forth via `thread` (append-only), a reviewer
 * resolves. Timestamps are Firestore Timestamps as stored; the view layer
 * converts as needed.
 *
 * `thread` is the source of truth for the conversation. The legacy single
 * `message` / `response` fields are retained for backward-compat reads of any
 * note not yet migrated; new writes append to `thread`.
 */
export interface NoteClarification {
  status: 'open' | 'resolved';
  /** What kind of flag this is. Absent → treat as 'clarification' (legacy). */
  kind?: ClarificationKind;
  /**
   * When true on an OPEN correction, the author is BLOCKED from starting or
   * submitting new notes until she actually AMENDS this note (a thread reply
   * is not a fix). Set at flag time (reviewer checkbox, default on for
   * corrections), cleared server-side by the amendment event or a reviewer's
   * explicit unblock/resolve. The enforceable mirror lives on the author's
   * users doc (correctionsBlock, Admin-SDK-only) — this field is the per-note
   * source the mirror is recomputed from.
   */
  blocksNotes?: boolean;
  /** Append-only conversation. First entry is the reviewer's opening question. */
  thread?: ClarificationMessage[];
  message: string;
  flaggedBy: string;
  flaggedByName: string;
  flaggedByRole: Role;
  flaggedAt?: Timestamp | null;
  response?: string;
  respondedBy?: string;
  respondedByName?: string;
  respondedByRole?: Role;
  respondedAt?: Timestamp | null;
  resolvedBy?: string;
  resolvedByName?: string;
  resolvedByRole?: Role;
  resolvedAt?: Timestamp | null;
  resolutionNote?: string;
}

/**
 * Build a normalized message list from a clarification, preferring `thread` and
 * falling back to the legacy `message` + `response` single fields. Used by every
 * reader (panel, gate, summary) so migrated and un-migrated notes render the same.
 */
export function clarificationMessages(c: NoteClarification | null | undefined): ClarificationMessage[] {
  if (!c) return [];
  if (Array.isArray(c.thread) && c.thread.length > 0) return c.thread;
  const out: ClarificationMessage[] = [];
  if (c.message) {
    out.push({ by: c.flaggedBy, byName: c.flaggedByName, byRole: c.flaggedByRole, text: c.message, at: c.flaggedAt ?? null });
  }
  if (c.response) {
    out.push({ by: c.respondedBy || '', byName: c.respondedByName || '', byRole: c.respondedByRole || 'nurse', text: c.response, at: c.respondedAt ?? null });
  }
  return out;
}

/**
 * True when an OPEN clarification is currently awaiting the nurse — i.e. the
 * most recent message is from a reviewer (not the nurse). This is the single
 * condition that arms the nurse's blocking gate.
 */
export function clarificationAwaitsNurse(c: NoteClarification | null | undefined): boolean {
  if (!c || c.status !== 'open') return false;
  const msgs = clarificationMessages(c);
  if (msgs.length === 0) return false;
  return msgs[msgs.length - 1].byRole !== 'nurse';
}

/**
 * True when an OPEN flag is waiting on a REVIEWER: the most recent message is
 * the author's — a reply, or the "Amended the note" line the server appends —
 * and no reviewer has answered or resolved since. Mirror of
 * clarificationAwaitsNurse for the supervisor-side Submissions badge.
 *
 * Compares the author's uid when the message carries one, because a reviewer
 * can also hold role 'nurse' (an RN reviewing a colleague's note), which makes
 * byRole alone ambiguous. Legacy thread entries reconstructed from the single
 * `response` field may have no uid; those fall back to the role check.
 */
export function clarificationAwaitsReviewer(
  c: NoteClarification | null | undefined,
  authorId?: string,
): boolean {
  if (!c || c.status !== 'open') return false;
  const msgs = clarificationMessages(c);
  if (msgs.length === 0) return false;
  const last = msgs[msgs.length - 1];
  if (authorId && last.by) return last.by === authorId;
  return last.byRole === 'nurse';
}

/**
 * True when this note's flag currently blocks its author from new notes:
 * an OPEN correction with blocksNotes set. A clarification (question) never
 * blocks, and a resolved flag never blocks.
 */
export function clarificationBlocksNotes(c: NoteClarification | null | undefined): boolean {
  return !!c && c.status === 'open' && c.kind === 'correction' && c.blocksNotes === true;
}
