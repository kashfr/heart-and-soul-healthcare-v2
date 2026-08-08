import 'server-only';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { sendClarificationFlagNotice } from './emails/clarificationFlag';
import { sendCorrectionAmendedNotice } from './emails/correctionAmended';
import { sendSms } from './sms/sendSms';
import { createPortalNotification } from './notificationsServer';
import { getServerSettings } from './settingsServer';

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
export type ClarificationAction = 'flag' | 'respond' | 'resolve' | 'setBlock';

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

/**
 * Best-effort email to the note's author that a reviewer has flagged her note
 * or posted a follow-up. Looks up her email from her user doc. Never throws:
 * the flag/respond write has already committed, so a mail failure is logged
 * and swallowed (the in-app gate still catches her on next sign-in).
 */
async function notifyNurseOfFlag(params: {
  authorId: string;
  clientName: string;
  dateOfService: string;
  kind: 'clarification' | 'correction';
  reviewerName: string;
  message: string;
  isFollowUp: boolean;
}): Promise<void> {
  try {
    if (!params.authorId) return;
    const userSnap = await adminDb().collection('users').doc(params.authorId).get();
    const u = userSnap.data() || {};
    const email = String(u.email || '');
    const phone = String(u.phone || '');

    if (email) {
      await sendClarificationFlagNotice({
        to: email,
        nurseName: String(u.displayName || ''),
        clientName: params.clientName,
        dateOfService: params.dateOfService,
        kind: params.kind,
        reviewerName: params.reviewerName,
        message: params.message,
        isFollowUp: params.isFollowUp,
      });
    }

    // PHI-free SMS nudge alongside the email (no client name or clinical
    // detail, since SMS is unencrypted and not a covered service under Quo's
    // BAA). Self-gating: no-ops when Quo isn't configured, so this is safe to
    // ship before the credentials are added.
    if (phone) {
      const smsBody = params.isFollowUp
        ? 'Heart and Soul: a follow-up question was added to a note awaiting your reply. Please sign in: https://www.heartandsoulhc.org/login Reply STOP to opt out.'
        : `Heart and Soul: one of your notes was flagged for ${params.kind}. Please sign in to respond: https://www.heartandsoulhc.org/login Reply STOP to opt out.`;
      await sendSms(phone, smsBody);
    }
  } catch (err) {
    console.error('Failed to notify nurse of clarification:', err);
  }
}

/**
 * Recompute the enforceable per-nurse block mirror on users/{uid} from the
 * per-note truth: any OPEN correction with blocksNotes still set means the
 * nurse may not start or submit NEW notes. The users doc is Admin-SDK-only
 * (rules deny all client writes), so this flag can't be forged off, and the
 * progressNotes CREATE rule reads it as the hard stop. Called after every
 * write that can change the answer (flag, setBlock, resolve, amendment).
 */
export async function recomputeCorrectionsBlock(uid: string): Promise<void> {
  if (!uid) return;
  // Composite index: progressNotes (nurseId ASC, clarification.status ASC).
  const snap = await adminDb()
    .collection('progressNotes')
    .where('nurseId', '==', uid)
    .where('clarification.status', '==', 'open')
    .get();
  const noteIds = snap.docs
    .filter((d) => {
      const c = (d.data().clarification || {}) as Record<string, unknown>;
      return c.kind === 'correction' && c.blocksNotes === true;
    })
    .map((d) => d.id);
  await adminDb()
    .collection('users')
    .doc(uid)
    .set(
      {
        correctionsBlock: {
          active: noteIds.length > 0,
          noteIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true },
    );
}

/**
 * Fan out the "a blocked note was amended" event: the configured corrections
 * reviewer gets email + PHI-free SMS + a bell item, every active admin gets
 * email + bell (visibility so any of them can verify and resolve if the
 * reviewer is busy). Best-effort: never throws.
 */
async function notifyCorrectionAmended(params: {
  noteId: string;
  nurseName: string;
  clientName: string;
  dateOfService: string;
}): Promise<void> {
  try {
    const settings = await getServerSettings();
    const reviewerUid = settings.corrections.reviewerUid;
    const noteUrl = `https://www.heartandsoulhc.org/admin/submissions/${params.noteId}`;
    const bellText = `${params.nurseName || 'A nurse'} amended a note flagged for correction. Review and resolve it.`;

    // Recipients: the configured reviewer + every active admin, deduped.
    const recipients = new Map<string, { email: string; phone: string; name: string; isReviewer: boolean }>();
    if (reviewerUid) {
      const r = await adminDb().collection('users').doc(reviewerUid).get();
      const u = r.data() || {};
      recipients.set(reviewerUid, {
        email: String(u.email || ''),
        phone: String(u.phone || ''),
        name: String(u.displayName || ''),
        isReviewer: true,
      });
    }
    const adminsSnap = await adminDb()
      .collection('users')
      .where('role', '==', 'admin')
      .get();
    for (const d of adminsSnap.docs) {
      const u = d.data() || {};
      if (u.active !== true || recipients.has(d.id)) continue;
      recipients.set(d.id, {
        email: String(u.email || ''),
        phone: String(u.phone || ''),
        name: String(u.displayName || ''),
        isReviewer: false,
      });
    }

    for (const [uid, r] of recipients) {
      if (r.email) {
        await sendCorrectionAmendedNotice({
          to: r.email,
          recipientName: r.name,
          nurseName: params.nurseName,
          clientName: params.clientName,
          dateOfService: params.dateOfService,
          noteUrl,
        });
      }
      // SMS only to the reviewer (the person expected to act promptly);
      // admins get email + bell without the text-message noise. PHI-free.
      if (r.isReviewer && r.phone) {
        await sendSms(
          r.phone,
          'Heart and Soul: a note flagged for correction was just amended by the nurse. Please review it in the portal: https://www.heartandsoulhc.org/login Reply STOP to opt out.',
        );
      }
      await createPortalNotification(adminDb(), {
        userId: uid,
        kind: 'correction-amended',
        text: bellText,
        href: `/admin/submissions/${params.noteId}`,
      });
    }
  } catch (err) {
    console.error('Failed to notify on correction amendment:', err);
  }
}

export type AmendedEventFailureReason = 'not-found' | 'forbidden' | 'no-block' | 'no-amendment';

export interface AmendedEventResult {
  ok: boolean;
  reason?: AmendedEventFailureReason;
  message?: string;
  /** True when the caller's block state changed (last blocked note amended). */
  blockLifted?: boolean;
}

/**
 * The nurse's "I fixed it" event, fired after she saves an AMENDMENT to a note
 * whose open correction blocks her. Verifies a real amendment just happened
 * (latest editHistory entry is hers and recent — a thread reply or a bare API
 * call cannot lift the block), then clears the note's blocksNotes, appends a
 * system line to the thread, recomputes her users-doc block, and notifies the
 * reviewer + admins. The flag itself stays OPEN for reviewer resolution.
 */
export async function recordCorrectionAmended(
  noteId: string,
  caller: AuthedCaller,
): Promise<AmendedEventResult> {
  const docRef = adminDb().collection('progressNotes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) return { ok: false, reason: 'not-found', message: 'Note not found.' };
  const data = snap.data() || {};
  const authorId = String(data.nurseId || '');
  if (!authorId || authorId !== caller.uid) {
    return { ok: false, reason: 'forbidden', message: 'Only the note author can record a correction fix.' };
  }
  const clar = (data.clarification || {}) as Record<string, unknown>;
  if (clar.status !== 'open' || clar.kind !== 'correction' || clar.blocksNotes !== true) {
    return { ok: false, reason: 'no-block', message: 'This note has no blocking correction.' };
  }

  // Proof of an actual fix: the newest editHistory entry must be the caller's
  // and written within the last 15 minutes.
  const editsSnap = await docRef
    .collection('editHistory')
    .orderBy('editedAt', 'desc')
    .limit(1)
    .get();
  const latest = editsSnap.docs[0]?.data();
  const editedAt = latest?.editedAt as Timestamp | undefined;
  const fresh =
    latest &&
    String(latest.editedBy || '') === caller.uid &&
    editedAt &&
    Date.now() - editedAt.toMillis() < 15 * 60 * 1000;
  if (!fresh) {
    return {
      ok: false,
      reason: 'no-amendment',
      message: 'No recent amendment by you was found on this note. Save your correction first.',
    };
  }

  const name = caller.profile.displayName || '';
  const thread = existingThread(clar);
  thread.push({
    by: caller.uid,
    byName: name,
    byRole: caller.role,
    text: 'Amended the note. The changes are listed in the amendment history below.',
    at: Timestamp.now(),
  });
  await docRef.update({
    'clarification.blocksNotes': false,
    'clarification.thread': thread,
    'clarification.response': 'Amended the note.',
    'clarification.respondedBy': caller.uid,
    'clarification.respondedByName': name,
    'clarification.respondedByRole': caller.role,
    'clarification.respondedAt': FieldValue.serverTimestamp(),
  });
  await recomputeCorrectionsBlock(authorId);
  await notifyCorrectionAmended({
    noteId,
    nurseName: name,
    clientName: String(data.q3_clientName || ''),
    dateOfService: String(data.q6_dateofService || ''),
  });
  return { ok: true, blockLifted: true };
}

export async function applyClarification(
  noteId: string,
  caller: AuthedCaller,
  action: ClarificationAction,
  text: string,
  kind?: 'clarification' | 'correction',
  blocksNotes?: boolean
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
    const isCorrectionFlag = kind === 'correction';
    // A correction can BLOCK the author from new notes until she amends this
    // one. The reviewer's checkbox decides (default comes from settings on the
    // client); a clarification (question) never blocks.
    const blocks = isCorrectionFlag && blocksNotes === true;
    await docRef.update({
      clarification: {
        status: 'open',
        kind: isCorrectionFlag ? 'correction' : 'clarification',
        blocksNotes: blocks,
        thread: [firstMsg],
        message: trimmed,
        flaggedBy: caller.uid,
        flaggedByName: name,
        flaggedByRole: caller.role,
        flaggedAt: FieldValue.serverTimestamp(),
      },
    });
    if (blocks) await recomputeCorrectionsBlock(authorId);
    // Email the author so she learns about the flag without having to be in
    // the portal. Best-effort; the flag is already saved above.
    await notifyNurseOfFlag({
      authorId,
      clientName: String(data.q3_clientName || ''),
      dateOfService: String(data.q6_dateofService || ''),
      kind: kind === 'correction' ? 'correction' : 'clarification',
      reviewerName: name,
      message: trimmed,
      isFollowUp: false,
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
    // A reviewer follow-up (not the nurse's own reply) re-arms the gate, so
    // email the author there's a new question awaiting her.
    if (!isAuthor && canReview(caller)) {
      await notifyNurseOfFlag({
        authorId,
        clientName: String(data.q3_clientName || ''),
        dateOfService: String(data.q6_dateofService || ''),
        kind: clarification?.kind === 'correction' ? 'correction' : 'clarification',
        reviewerName: name,
        message: trimmed,
        isFollowUp: true,
      });
    }
    return { ok: true, noteId };
  }

  if (action === 'setBlock') {
    // Reviewer lever: turn the new-notes block on/off for an open correction
    // without resolving it ("clear a simple block", or re-arm one when the
    // nurse's amendment didn't actually fix the issue).
    if (!canReview(caller)) {
      return fail(noteId, 'forbidden', 'Only RNs, supervisors, or admins can change the block.');
    }
    if (!isOpen || clarification?.kind !== 'correction') {
      return fail(noteId, 'no-open-flag', 'Only an open correction can block new notes.');
    }
    await docRef.update({
      'clarification.blocksNotes': blocksNotes === true,
      'clarification.blockSetBy': caller.uid,
      'clarification.blockSetByName': name,
      'clarification.blockSetAt': FieldValue.serverTimestamp(),
    });
    await recomputeCorrectionsBlock(authorId);
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
    'clarification.blocksNotes': false,
    'clarification.resolvedBy': caller.uid,
    'clarification.resolvedByName': name,
    'clarification.resolvedByRole': caller.role,
    'clarification.resolvedAt': FieldValue.serverTimestamp(),
    ...(trimmed ? { 'clarification.resolutionNote': trimmed } : {}),
  });
  // Resolving may have been the nurse's last blocking note — recompute so her
  // gate lifts without waiting for anything else.
  if (clarification?.blocksNotes === true) await recomputeCorrectionsBlock(authorId);
  return { ok: true, noteId };
}
