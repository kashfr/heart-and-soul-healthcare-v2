import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { getServerSettings } from './settingsServer';
import type { AuthedCaller } from './adminAuthGuard';

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
  'wrong-credential': 'This note credential does not require co-signature per current settings.',
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
  // Required-credential list comes from /admin/settings now. Admin can
  // narrow (e.g. drop HHA) or widen (add a future credential). One
  // settings read per cosign call — cheap and keeps the policy honest
  // even mid-session if admin flips the toggle.
  const settings = await getServerSettings();
  // Widen to Set<string> so the .has(credential) check below — where
  // `credential` is a raw string from Firestore — type-checks. The
  // settings module's CosignableCredential union is a subset of string,
  // so this is a safe widening.
  const required: Set<string> = new Set(settings.cosign.requiredCredentials);

  const docRef = adminDb().collection('progressNotes').doc(noteId);
  const snap = await docRef.get();
  if (!snap.exists) return fail(noteId, 'not-found');

  const data = snap.data() || {};
  const credential = String(data.q12_credential || '');
  const status = String(data.status || '');
  const nurseId = String(data.nurseId || '');

  if (status !== 'submitted') return fail(noteId, 'wrong-status');
  if (!required.has(credential)) return fail(noteId, 'wrong-credential');
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
