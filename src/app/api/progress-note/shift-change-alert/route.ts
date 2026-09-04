import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getServerSettings } from '@/lib/settingsServer';
import { sendShiftChangeAlert } from '@/lib/emails/shiftChangeAlert';
import { sendSms } from '@/lib/sms/sendSms';
import { formatDateUS } from '@/lib/dateFormat';
import {
  readShiftChange,
  shiftChangeBellText,
  shiftChangeSmsText,
  type ShiftChangeAlertContext,
} from '@/lib/shiftChange';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/progress-note/shift-change-alert  { noteId }
 *
 * Fired by the note form right after a note is saved (and after an amendment,
 * since an amendment can turn an answer to Yes). If the saved note answers Yes
 * to any "since your last shift" question — hospital admission, urgent care /
 * ER visit, medication started / changed / stopped — the recipients picked
 * under Settings → Shift-change alerts (falling back to the corrections
 * reviewer) get email + a bell item naming the client, and a PHI-free text if
 * they have a phone on file. The author is never alerted about her own note.
 *
 * The answers are re-read from the SAVED note, never trusted from the browser.
 * Dedup: the note is stamped shiftChangeAlertedAt in a transaction so a retry
 * or a later amendment can't ring twice. Best-effort at the caller: the note
 * is already saved; a failure here is logged, not fatal.
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
  const noteId = String(body.noteId || '').trim();
  if (!noteId) {
    return NextResponse.json({ error: 'noteId is required.' }, { status: 400 });
  }

  const db = adminDb();
  const noteRef = db.collection('progressNotes').doc(noteId);
  const noteSnap = await noteRef.get();
  if (!noteSnap.exists) {
    return NextResponse.json({ error: 'Note not found.' }, { status: 404 });
  }
  const note = noteSnap.data() || {};
  const authorId = String(note.nurseId || '');
  const isStaff = caller.role === 'admin' || caller.role === 'supervisor';
  // The author fires this after her own submit; staff fire it after amending
  // someone else's note. Anyone else replaying a noteId gets nothing.
  if (authorId !== caller.uid && !isStaff) {
    return NextResponse.json({ error: 'You can only send alerts for notes you authored.' }, { status: 403 });
  }

  const report = readShiftChange(note);
  if (!report.any) {
    return NextResponse.json({ alerted: false, reason: 'nothing-reported' });
  }

  // Transactional claim: exactly one request sends the alert, even under
  // concurrent retries or a submit followed by an immediate amendment.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(noteRef);
    if ((snap.data() || {}).shiftChangeAlertedAt) return false;
    tx.update(noteRef, { shiftChangeAlertedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) {
    return NextResponse.json({ alerted: false, reason: 'already-alerted' });
  }

  // Recipients: the configured list, else the corrections reviewer so the
  // alert works before anyone has opened the new Settings section.
  let recipientUids: string[] = [];
  try {
    const settings = await getServerSettings();
    recipientUids = settings.shiftChangeAlerts.recipientUids;
    if (recipientUids.length === 0 && settings.corrections.reviewerUid) {
      recipientUids = [settings.corrections.reviewerUid];
    }
  } catch (err) {
    console.error('Shift-change alert: settings fetch failed; no recipients resolved.', err);
  }
  recipientUids = recipientUids.filter((uid) => uid && uid !== authorId);

  const patientId = String(note.patientId || '');
  const ctx: ShiftChangeAlertContext = {
    nurseName: String(note.q11_nurseName || ''),
    credential: String(note.q12_credential || ''),
    clientName: String(note.q3_clientName || 'a client'),
    dateOfService: formatDateUS(String(note.q6_dateofService || '')),
    report,
  };
  const noteUrl = `https://www.heartandsoulhc.org/admin/submissions/${noteId}`;
  const marUrl = patientId ? `https://www.heartandsoulhc.org/admin/records/${patientId}/mar` : '';
  const bellText = shiftChangeBellText(ctx);

  let delivered = 0;
  for (const uid of recipientUids) {
    let u: Record<string, unknown> = {};
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) continue;
      u = snap.data() || {};
    } catch (err) {
      console.error(`Shift-change alert: user lookup failed for ${uid}.`, err);
      continue;
    }
    if (u.active === false) continue;
    const email = String(u.email || '');
    const phone = String(u.phone || '');
    if (email) {
      await sendShiftChangeAlert({ ...ctx, to: email, recipientName: String(u.displayName || ''), noteUrl, marUrl });
    }
    if (phone) {
      await sendSms(phone, shiftChangeSmsText(ctx));
    }
    // Written directly (not via createPortalNotification, which swallows
    // errors) so we can tell whether any bell actually rang.
    try {
      await db.collection('notifications').add({
        userId: uid,
        kind: 'shift-change-alert',
        text: bellText,
        href: `/admin/submissions/${noteId}`,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
      delivered++;
    } catch (err) {
      console.error(`Shift-change bell failed for ${uid}:`, err);
    }
  }

  if (recipientUids.length > 0 && delivered === 0) {
    // Every bell failed — release the claim so a retry can alert.
    await noteRef.update({ shiftChangeAlertedAt: FieldValue.delete() }).catch(() => {});
    return NextResponse.json({ alerted: false, reason: 'delivery-failed' }, { status: 502 });
  }
  return NextResponse.json({ alerted: true, recipients: delivered });
}
