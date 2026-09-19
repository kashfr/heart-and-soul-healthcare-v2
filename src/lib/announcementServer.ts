import 'server-only';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import type { AuthedCaller } from './adminAuthGuard';
import { normalizeAnnouncementInput, validateAnnouncementInput, type AnnouncementInput } from './announcementShared';

/**
 * Announcements are written ONLY here (Admin SDK): firestore.rules deny every
 * client write, so the acknowledgment map is trustworthy as a read receipt.
 */

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function publishAnnouncement(raw: AnnouncementInput, caller: AuthedCaller): Promise<{ ok: true; id: string } | { ok: false; error: string; field?: string }> {
  const input = normalizeAnnouncementInput(raw);
  const errs = validateAnnouncementInput(input);
  const firstField = Object.keys(errs)[0];
  if (firstField) return { ok: false, error: errs[firstField as keyof typeof errs] as string, field: firstField };
  const ref = adminDb().collection('announcements').doc();
  await ref.set({
    ...input,
    active: true,
    publishedAt: FieldValue.serverTimestamp(),
    publishedBy: caller.uid,
    publishedByName: caller.profile.displayName || caller.email || '',
    acks: {},
    ackCount: 0,
  });
  return { ok: true, id: ref.id };
}

/** Idempotent: a second click from the same user changes nothing. */
export async function acknowledgeAnnouncement(id: string, caller: AuthedCaller): Promise<{ ok: true; already: boolean } | { ok: false; error: string; status: number }> {
  if (!ID_RE.test(id)) return { ok: false, error: 'Invalid id.', status: 400 };
  const ref = adminDb().collection('announcements').doc(id);
  const name = caller.profile.displayName || caller.email || '';
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false as const, error: 'That announcement no longer exists.', status: 404 };
    const d = snap.data() as { audience?: string[]; acks?: Record<string, unknown> };
    if (!Array.isArray(d.audience) || !d.audience.includes(caller.role)) return { ok: false as const, error: 'This announcement was not addressed to you.', status: 403 };
    if (d.acks && Object.prototype.hasOwnProperty.call(d.acks, caller.uid)) return { ok: true as const, already: true };
    tx.update(ref, new FieldPath('acks', caller.uid), { at: FieldValue.serverTimestamp(), name }, 'ackCount', FieldValue.increment(1));
    return { ok: true as const, already: false };
  });
}

export async function retireAnnouncement(id: string, caller: AuthedCaller): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!ID_RE.test(id)) return { ok: false, error: 'Invalid id.', status: 400 };
  const ref = adminDb().collection('announcements').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'That announcement no longer exists.', status: 404 };
  await ref.update({ active: false, retiredAt: FieldValue.serverTimestamp(), retiredBy: caller.uid });
  return { ok: true };
}
