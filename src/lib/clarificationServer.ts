import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

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
  text: string
): Promise<ClarificationResult> {
  const docRef = adminDb().collection('progressNotes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) return fail(noteId, 'not-found', 'Note not found.');

  const data = snap.data() || {};
  const clarification = data.clarification as { status?: string } | undefined;
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
    // Replace any prior (resolved) thread with the new open one.
    await docRef.update({
      clarification: {
        status: 'open',
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
    await docRef.update({
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
