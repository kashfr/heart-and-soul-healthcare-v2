import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { sendSms } from '@/lib/sms/sendSms';
import {
  computeHandoffRecipients,
  handoffBellText,
  handoffSmsText,
  isSubstantiveHandoffText,
  normalizeHandoffText,
  type HandoffSource,
} from '@/lib/handoffShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/handoffs
 *   { patientId, text, urgent?, source: 'note' | 'board', sourceNoteId?, shiftDate? }
 *
 * Creates a handoff post on a client's board and addresses it to every other
 * nurse on that client's care team. Server-side on purpose:
 *  - the recipient list comes from patients/{id}.assignedNurseIds here, never
 *    from the browser, so a post can't be aimed at (or hidden from) anyone;
 *  - bell notifications are Admin-SDK-only writes;
 *  - urgent posts text each recipient (PHI-free body).
 * The post text is immutable once written; rules permit only a recipient's
 * own acknowledgment afterwards.
 *
 * Idempotent per note: a 'note' post is stored at handoffs/note_{noteId}
 * with create(), so a second call for the same note returns the existing
 * post instead of ringing twice. The note's own next-shift plan is the text.
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

  let body: {
    patientId?: string;
    text?: string;
    urgent?: boolean;
    source?: string;
    sourceNoteId?: string;
    shiftDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patientId = String(body.patientId || '').trim();
  const urgent = body.urgent === true;
  const source: HandoffSource = body.source === 'note' ? 'note' : 'board';
  const sourceNoteId = source === 'note' ? String(body.sourceNoteId || '').trim() : '';
  const shiftDate = String(body.shiftDate || '').trim();

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(patientId)) {
    return NextResponse.json({ error: 'patientId is required.' }, { status: 400 });
  }
  if (source === 'note' && !/^[A-Za-z0-9_-]{1,128}$/.test(sourceNoteId)) {
    return NextResponse.json({ error: 'sourceNoteId is required for a note handoff.' }, { status: 400 });
  }
  if (shiftDate && !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
    return NextResponse.json({ error: 'shiftDate must be YYYY-MM-DD.' }, { status: 400 });
  }

  const db = adminDb();
  const patientSnap = await db.collection('patients').doc(patientId).get();
  if (!patientSnap.exists) {
    return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
  }
  const patient = patientSnap.data() || {};
  const assigned: string[] = Array.isArray(patient.assignedNurseIds) ? patient.assignedNurseIds : [];

  // Text: a board post carries what the nurse typed; a note post takes the
  // next-shift plan from the SAVED note (never the browser), so "from
  // progress note" always means exactly that.
  let text = '';
  if (source === 'note') {
    const noteSnap = await db.collection('progressNotes').doc(sourceNoteId).get();
    if (!noteSnap.exists) {
      return NextResponse.json({ error: 'Source note not found.' }, { status: 404 });
    }
    const note = noteSnap.data() || {};
    const noteAuthor = String(note.nurseId || '');
    // A nurse may only hang a handoff on her own note. Authoring a note on
    // this client is itself the authorization — her first note on a client
    // fires the care-team auto-add in parallel, so assignedNurseIds may not
    // list her yet.
    if (caller.role === 'nurse' && noteAuthor !== caller.uid) {
      return NextResponse.json({ error: 'You can only post a handoff for your own note.' }, { status: 403 });
    }
    if (String(note.patientId || '') !== patientId) {
      return NextResponse.json({ error: 'Source note belongs to a different client.' }, { status: 400 });
    }
    text = normalizeHandoffText(note.q60_nextShiftPlan);
    if (!isSubstantiveHandoffText(text)) {
      return NextResponse.json({
        id: '',
        skipped: true,
        recipients: 0,
        bells: 0,
        sms: 0,
      });
    }
  } else {
    text = normalizeHandoffText(body.text);
    if (!text) return NextResponse.json({ error: 'Handoff text is required.' }, { status: 400 });
    // A nurse may only post on a client she is assigned to. Staff may post on
    // any board (a supervisor relaying an order change, for instance).
    if (caller.role === 'nurse' && !assigned.includes(caller.uid)) {
      return NextResponse.json({ error: "You are not on this client's care team." }, { status: 403 });
    }
  }

  const recipientIds = computeHandoffRecipients(assigned, caller.uid);

  // Resolve recipient profiles once: names are denormalized onto the post so
  // the board can show who still owes an acknowledgment without every nurse
  // needing read access to users/*. Inactive logins and non-nurse roles are
  // skipped — only a nurse session ever sees the inbox, so anyone else in
  // pendingIds would hold the post "open" forever.
  const recipients: { uid: string; name: string; phone: string }[] = [];
  for (const uid of recipientIds) {
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) continue;
      const u = snap.data() || {};
      if (u.active === false || u.role !== 'nurse') continue;
      recipients.push({
        uid,
        name: String(u.displayName || u.email || 'a nurse'),
        phone: String(u.phone || ''),
      });
    } catch (err) {
      console.error(`Handoff: user lookup failed for ${uid}.`, err);
    }
  }

  const authorName = String(caller.profile.displayName || caller.email || '');
  const authorCredential = String(caller.profile.credential || '');
  const clientName = String(patient.name || '');
  const finalRecipientIds = recipients.map((r) => r.uid);
  const recipientNames: Record<string, string> = {};
  for (const r of recipients) recipientNames[r.uid] = r.name;

  // Note posts get a deterministic id so a retry racing the first call can't
  // post (and ring every bell) twice: create() fails with ALREADY_EXISTS.
  const ref = sourceNoteId
    ? db.collection('handoffs').doc(`note_${sourceNoteId}`)
    : db.collection('handoffs').doc();
  try {
    await ref.create({
      patientId,
      patientName: clientName,
      authorId: caller.uid,
      authorName,
      authorCredential,
      text,
      urgent,
      source,
      sourceNoteId,
      shiftDate,
      recipientIds: finalRecipientIds,
      recipientNames,
      pendingIds: finalRecipientIds,
      acks: {},
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const code = (err as { code?: number | string }).code;
    if (sourceNoteId && (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS')) {
      const existing = (await ref.get()).data() || {};
      return NextResponse.json({
        id: ref.id,
        existing: true,
        recipients: Array.isArray(existing.recipientIds) ? existing.recipientIds.length : 0,
        bells: 0,
        sms: 0,
      });
    }
    throw err;
  }

  // Notify. Bell for everyone (names the client — behind the login); SMS only
  // when the poster marked it urgent, and only PHI-free text. Both best-effort:
  // the post is the record and already exists.
  const bellText = handoffBellText({ clientName, authorName, urgent });
  const href = `/admin/handoffs?h=${ref.id}`;
  let bells = 0;
  let sms = 0;
  for (const r of recipients) {
    try {
      await db.collection('notifications').add({
        userId: r.uid,
        kind: urgent ? 'handoff-urgent' : 'handoff',
        text: bellText,
        href,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
      bells++;
    } catch (err) {
      console.error(`Handoff bell failed for ${r.uid}:`, err);
    }
    if (urgent && r.phone) {
      const result = await sendSms(r.phone, handoffSmsText());
      if (result.ok) sms++;
    }
  }
  return NextResponse.json({
    id: ref.id,
    recipients: recipients.length,
    bells,
    sms,
  });
}
