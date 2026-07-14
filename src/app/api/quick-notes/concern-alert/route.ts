import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Concern escalation for quick notes (bell-only, owner's call): when a
 * care-team member files a quick note tagged 'concern', every ACTIVE admin
 * and supervisor gets an in-portal bell notification naming the client —
 * a documented concern must never just sit waiting to be stumbled on.
 *
 * Security: the caller must be the note's author (prevents replaying other
 * people's noteIds to spam staff bells). Dedup: the note is stamped with
 * concernAlertedAt (Admin SDK — client writes stay immutable) so a retry
 * can't double-notify. Best-effort at the caller: the note itself is
 * already saved; a failed alert only changes what the toast reports.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: { noteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const noteId = (body.noteId || '').trim();
  if (!noteId) {
    return NextResponse.json({ error: 'noteId is required.' }, { status: 400 });
  }

  const db = adminDb();
  const noteRef = db.collection('quickNotes').doc(noteId);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }
  const note = noteSnap.data() || {};

  if ((note.authorId as string) !== caller.uid) {
    return NextResponse.json(
      { error: 'You can only send alerts for notes you authored.' },
      { status: 403 },
    );
  }
  if ((note.category as string) !== 'concern') {
    return NextResponse.json({ alerted: false, reason: 'not-a-concern' });
  }

  // Transactional claim: exactly one request gets to send the alert, even
  // under concurrent retries (check-then-set outside a transaction would
  // double-ring every staff bell).
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(noteRef);
    if ((snap.data() || {}).concernAlertedAt) return false;
    tx.update(noteRef, { concernAlertedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) {
    return NextResponse.json({ alerted: false, reason: 'already-alerted' });
  }

  const patientId = String(note.patientId || '');
  const patientSnap = patientId
    ? await db.collection('patients').doc(patientId).get().catch(() => null)
    : null;
  const clientName = patientSnap?.exists
    ? String((patientSnap.data() as { name?: string }).name || 'a client')
    : 'a client';

  // Every active admin + supervisor hears about it — except the author
  // (an admin filing a concern doesn't need to be told about her own note).
  const staffSnap = await db
    .collection('users')
    .where('role', 'in', ['admin', 'supervisor'])
    .get();
  const recipients = staffSnap.docs.filter((d) => {
    const u = d.data() as { active?: boolean };
    return d.id !== caller.uid && u.active !== false;
  });

  // Written directly (not via createPortalNotification, which swallows
  // errors) because this is a safety escalation: the caller's toast must
  // tell the truth about whether any bell actually rang.
  const text = `Concern noted for ${clientName} by ${String(note.authorName || 'a team member')}`;
  let delivered = 0;
  await Promise.all(
    recipients.map(async (d) => {
      try {
        await db.collection('notifications').add({
          userId: d.id,
          kind: 'quick-note-concern',
          text,
          // Deep link straight to the note (?qn=): the bell recipient lands
          // on the client dashboard with the concern note already open.
          href: `/admin/clients/${patientId}?qn=${noteId}`,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        });
        delivered++;
      } catch (err) {
        console.error(`Concern bell failed for ${d.id}:`, err);
      }
    }),
  );

  if (recipients.length > 0 && delivered === 0) {
    // Every bell failed — release the claim so a retry can alert, and tell
    // the caller honestly so the author knows to escalate directly.
    await noteRef.update({ concernAlertedAt: FieldValue.delete() }).catch(() => {});
    return NextResponse.json(
      { alerted: false, reason: 'delivery-failed' },
      { status: 502 },
    );
  }

  return NextResponse.json({ alerted: true, recipients: delivered });
}
