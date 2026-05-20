import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';

/** Credentials whose notes require an RN to co-sign. RN notes are exempt. */
const COSIGN_REQUIRED_CREDENTIALS = new Set(['HHA', 'CNA', 'LPN']);

export type CosignFailureReason =
  | 'not-found'
  | 'wrong-status'
  | 'wrong-credential'
  | 'self-author'
  | 'already-cosigned';

export interface CosignSuccess {
  ok: true;
  noteId: string;
}

export interface CosignFailure {
  ok: false;
  noteId: string;
  reason: CosignFailureReason;
  message: string;
}

export type CosignResult = CosignSuccess | CosignFailure;

const REASON_MESSAGES: Record<CosignFailureReason, string> = {
  'not-found': 'Note not found.',
  'wrong-status': 'Only submitted notes can be co-signed.',
  'wrong-credential': 'Only HHA, CNA, and LPN notes need an RN co-signature.',
  'self-author': 'You cannot co-sign a note you authored.',
  'already-cosigned': 'This note has already been co-signed.',
};

function fail(noteId: string, reason: CosignFailureReason): CosignFailure {
  return { ok: false, noteId, reason, message: REASON_MESSAGES[reason] };
}

/**
 * Apply an RN co-signature to a single progress note. Returns a per-note
 * result so callers (single + batch routes) can aggregate uniformly.
 *
 * Assumes the caller's RN-credential check has already been performed —
 * the route handlers gate that once up front so the credential isn't
 * re-fetched for every note in a batch.
 */
export async function cosignNote(
  noteId: string,
  caller: AuthedCaller,
  signature: string
): Promise<CosignResult> {
  const docRef = adminDb().collection('progressNotes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) return fail(noteId, 'not-found');

  const data = snap.data() || {};
  const credential = String(data.q12_credential || '');
  const status = String(data.status || '');
  const nurseId = String(data.nurseId || '');

  if (status !== 'submitted') return fail(noteId, 'wrong-status');
  if (!COSIGN_REQUIRED_CREDENTIALS.has(credential)) return fail(noteId, 'wrong-credential');
  if (nurseId && nurseId === caller.uid) return fail(noteId, 'self-author');
  if (data.cosignedAt != null) return fail(noteId, 'already-cosigned');

  await docRef.update({
    cosignedAt: FieldValue.serverTimestamp(),
    cosignedBy: caller.uid,
    cosignedByName: caller.profile.displayName || '',
    cosignedCredential: 'RN',
    cosignedSignature: signature,
  });

  return { ok: true, noteId };
}
