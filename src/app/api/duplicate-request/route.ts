import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { sendDuplicateRequestNotice } from '@/lib/emails/duplicateRequest';
import type { Role } from '@/lib/auth';

/**
 * POST /api/duplicate-request
 *
 * A nurse (or any authoring staff) requests approval to submit a SECOND note
 * for a client she's already documented on that date. We:
 *   1. record the pending request on her own draft (noteDrafts/{uid}), and
 *   2. email admins + supervisors so they can act from In Progress.
 *
 * Body: { clientName, dateOfService, patientId?, reason }
 */
interface Body {
  clientName?: string;
  dateOfService?: string;
  patientId?: string;
  reason?: string;
}

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

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const clientName = (body.clientName || '').trim();
  const dateOfService = (body.dateOfService || '').trim();
  const patientId = (body.patientId || '').trim();
  const reason = (body.reason || '').trim();

  if (!clientName || !dateOfService) {
    return NextResponse.json({ error: 'clientName and dateOfService are required.' }, { status: 400 });
  }

  const nurseName = caller.profile?.displayName || caller.email || 'A nurse';

  // Record the request on the caller's draft. Merge keeps any in-progress note
  // content intact; we also stamp the top-level identity fields so the
  // In Progress row reads correctly even if autosave hasn't fired yet.
  await adminDb().collection('noteDrafts').doc(caller.uid).set(
    {
      nurseId: caller.uid,
      nurseName,
      clientName,
      dateOfService,
      dupRequest: {
        status: 'pending',
        clientName,
        dateOfService,
        ...(patientId ? { patientId } : {}),
        reason,
        requestedAt: FieldValue.serverTimestamp(),
      },
    },
    { merge: true }
  );

  // Notify admins + supervisors (best-effort — never fail the request on email).
  try {
    const usersSnap = await adminDb().collection('users').get();
    const recipients: string[] = [];
    for (const d of usersSnap.docs) {
      const u = d.data();
      const role = u.role as Role | undefined;
      if ((role === 'admin' || role === 'supervisor') && u.active !== false && typeof u.email === 'string' && u.email) {
        recipients.push(u.email);
      }
    }
    await sendDuplicateRequestNotice({ to: recipients, nurseName, clientName, dateOfService, reason });
  } catch (err) {
    console.error('Failed to send duplicate-request notice:', err);
  }

  return NextResponse.json({ ok: true });
}
