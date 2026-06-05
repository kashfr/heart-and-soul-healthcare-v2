import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

/** One entry in the append-only clarification conversation. */
interface ThreadMessage {
  by: string;
  byName: string;
  byRole: string;
  text: string;
  at: Timestamp;
}

/**
 * Build the thread for a note. Prefers an existing `thread` array; otherwise
 * reconstructs it from the legacy single `message` + `response` fields so a
 * not-yet-migrated note appends correctly instead of losing history.
 */
function existingThread(clar: Record<string, unknown> | undefined): ThreadMessage[] {
  if (!clar) return [];
  const t = clar.thread;
  if (Array.isArray(t)) return t as ThreadMessage[];
  const out: ThreadMessage[] = [];
  if (clar.message) {
    out.push({
      by: String(clar.flaggedBy || ''),
      byName: String(clar.flaggedByName || ''),
      byRole: String(clar.flaggedByRole || 'supervisor'),
      text: String(clar.message),
      at: (clar.flaggedAt as Timestamp) || Timestamp.now(),
    });
  }
  if (clar.response) {
    out.push({
      by: String(clar.respondedBy || ''),
      byName: String(clar.respondedByName || ''),
      byRole: String(clar.respondedByRole || 'nurse'),
      text: String(clar.response),
      at: (clar.respondedAt as Timestamp) || Timestamp.now(),
    });
  }
  return out;
}

/**
 * "Flag for clarification" — a lightweight, non-adversarial way for a reviewer
 * (RN / supervisor / admin) to ask the author a question about a submitted
 * note WITHOUT framing it as "requesting changes". The loop is:
 *   flag (reviewer asks)  ->  respond (author clarifies)  ->  resolve (reviewer closes)
 * One active thread per note. Everything records who + when.
 */
export type ClarificationAction = 'flag' | 'respond' | 'resolve';

export type ClarificationFailureReason =
  | 'not-found'
  | 'forbidden'
  | 'no-open-flag'
  | 'already-open'
  | 'missing-text';

export interface ClarificationResult {
  ok: boolean;
  noteId: string;
  reason?: ClarificationFailureReason;
  message?: string;
}

/** Reviewers who may raise or resolve a clarification: RN, supervisor, admin. */
function canReview(caller: AuthedCaller): boolean {
  return (
    caller.role === 'admin' ||
    caller.role === 'supervisor' ||
    caller.profile.credential === 'RN'
  );
}

const MAX_TEXT = 2000;

function fail(
  noteId: string,
  reason: ClarificationFailureReason,
  message: string
): ClarificationResult {
  return { ok: false, noteId, reason, message };
}

export async function applyClarification(
  noteId: string,
  caller: AuthedCaller,
  action: ClarificationAction,
  text: string,
  kind?: 'clarification' | 'correction'
): Promise<ClarificationResult> {
  const docRef = adminDb().collection('progressNotes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) return fail(noteId, 'not-found', 'Note not found.');

  const data = snap.data() || {};
  const clarification = data.clarification as Record<string, unknown> | undefined;
  const isOpen = clarification?.status === 'open';
  const authorId = String(data.nurseId || '');
  const name = caller.profile.displayName || '';
  const trimmed = String(text || '').trim().slice(0, MAX_TEXT);

  if (action === 'flag') {
    if (!canReview(caller)) {
      return fail(noteId, 'forbidden', 'Only RNs, supervisors, or admins can flag a note for clarification.');
    }
    if (isOpen) {
      return fail(noteId, 'already-open', 'This note already has an open clarification flag.');
    }
    if (!trimmed) {
      return fail(noteId, 'missing-text', 'A clarification message is required.');
    }
    // Replace any prior (resolved) thread with a brand-new open one. The
    // opening question is both the legacy `message` (back-compat) and the first
    // `thread` entry (source of truth going forward).
    const firstMsg: ThreadMessage = {
      by: caller.uid,
      byName: name,
      byRole: caller.role,
      text: trimmed,
      at: Timestamp.now(),
    };
    await docRef.update({
      clarification: {
        status: 'open',
        kind: kind === 'correction' ? 'correction' : 'clarification',
        thread: [firstMsg],
        message: trimmed,
        flaggedBy: caller.uid,
        flaggedByName: name,
        flaggedByRole: caller.role,
        flaggedAt: FieldValue.serverTimestamp(),
      },
    });
    return { ok: true, noteId };
  }

  if (action === 'respond') {
    if (!isOpen) {
      return fail(noteId, 'no-open-flag', 'There is no open clarification to respond to.');
    }
    const isAuthor = !!authorId && authorId === caller.uid;
    if (!isAuthor && !canReview(caller)) {
      return fail(noteId, 'forbidden', 'Only the note author or a reviewer can respond to a clarification.');
    }
    if (!trimmed) {
      return fail(noteId, 'missing-text', 'A response is required.');
    }
    // Append to the conversation (works for both the nurse author and reviewers).
    // We can't use serverTimestamp() inside an array element, so we read-modify-
    // write with a client-side Timestamp.now() for the message's `at`.
    const thread = existingThread(clarification as Record<string, unknown> | undefined);
    thread.push({
      by: caller.uid,
      byName: name,
      byRole: caller.role,
      text: trimmed,
      at: Timestamp.now(),
    });
    await docRef.update({
      'clarification.thread': thread,
      // Keep the legacy single-response fields pointing at the LATEST message so
      // any old reader still shows something sensible.
      'clarification.response': trimmed,
      'clarification.respondedBy': caller.uid,
      'clarification.respondedByName': name,
      'clarification.respondedByRole': caller.role,
      'clarification.respondedAt': FieldValue.serverTimestamp(),
    });
    return { ok: true, noteId };
  }

  // action === 'resolve'
  if (!canReview(caller)) {
    return fail(noteId, 'forbidden', 'Only RNs, supervisors, or admins can resolve a clarification.');
  }
  if (!isOpen) {
    return fail(noteId, 'no-open-flag', 'There is no open clarification to resolve.');
  }
  await docRef.update({
    'clarification.status': 'resolved',
    'clarification.resolvedBy': caller.uid,
    'clarification.resolvedByName': name,
    'clarification.resolvedByRole': caller.role,
    'clarification.resolvedAt': FieldValue.serverTimestamp(),
    ...(trimmed ? { 'clarification.resolutionNote': trimmed } : {}),
  });
  return { ok: true, noteId };
}
