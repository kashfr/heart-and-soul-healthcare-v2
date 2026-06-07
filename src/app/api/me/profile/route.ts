import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { sendEmailChangeRequestNotice } from '@/lib/emails/emailChangeRequest';
import { formatUSPhone, isValidUSPhone, phoneDigits } from '@/lib/phone';
import type { Role } from '@/lib/auth';

/**
 * PATCH /api/me/profile
 *
 * Self-service profile edits. The caller can ONLY ever modify their OWN user
 * doc — there is no uid parameter; we use the verified token's uid. Firestore
 * rules keep `/users` writes server-only, so this Admin SDK route is the single
 * gate for self edits.
 *
 * Supported actions (any combination):
 *   - phone: set/clear the contact number (validated US number). Saved
 *     immediately; phone is not an auth field, so there's no approval step.
 *   - emailChangeRequest: { newEmail, reason? } files a request to change the
 *     LOGIN email. This does NOT change the login. It records the request on the
 *     caller's doc and emails admins/supervisors so they can approve it from
 *     Staff & Roles.
 *   - cancelEmailRequest: true withdraws the caller's own pending request.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Body {
  phone?: string;
  emailChangeRequest?: { newEmail?: string; reason?: string };
  cancelEmailRequest?: boolean;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function PATCH(request: Request) {
  let caller;
  try {
    // Any signed-in staff member can edit their own profile.
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
    return badRequest('Invalid JSON body.');
  }

  const ref = adminDb().collection('users').doc(caller.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Your profile was not found.' }, { status: 404 });
  }
  const currentEmail = (snap.data()?.email as string | undefined) ?? caller.email ?? '';

  const update: Record<string, unknown> = {};
  let notifyRequest: { newEmail: string; reason: string } | null = null;

  // --- Phone (immediate) ---
  if (body.phone !== undefined) {
    const trimmed = body.phone.trim();
    if (trimmed && !isValidUSPhone(trimmed)) {
      return badRequest('Phone number must be a 10-digit US number.');
    }
    update.phone = trimmed ? formatUSPhone(phoneDigits(trimmed)) : '';
  }

  // --- Cancel a pending email-change request ---
  if (body.cancelEmailRequest) {
    update.emailChangeRequest = FieldValue.delete();
  }

  // --- File an email-change request (needs admin approval) ---
  if (body.emailChangeRequest) {
    // Preserve exactly what the user typed (case included); email matching is
    // case-insensitive, so we only lowercase for the "same as current" check.
    const newEmail = (body.emailChangeRequest.newEmail || '').trim();
    const reason = (body.emailChangeRequest.reason || '').trim();
    if (!newEmail) return badRequest('A new email address is required.');
    if (!EMAIL_RE.test(newEmail)) return badRequest("That doesn't look like a valid email address.");
    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      return badRequest('That is already your current email address.');
    }
    update.emailChangeRequest = {
      newEmail,
      reason,
      status: 'pending',
      requestedAt: FieldValue.serverTimestamp(),
    };
    notifyRequest = { newEmail, reason };
  }

  if (Object.keys(update).length === 0) {
    return badRequest('No updatable fields supplied.');
  }

  update.updatedAt = FieldValue.serverTimestamp();
  update.updatedBy = caller.uid;
  await ref.update(update);

  // Notify admins + supervisors of a new request (best-effort; never fail the
  // request on an email hiccup). They're the roles that can approve it.
  if (notifyRequest) {
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
      await sendEmailChangeRequestNotice({
        to: recipients,
        staffName: caller.profile?.displayName || currentEmail || 'A staff member',
        currentEmail,
        newEmail: notifyRequest.newEmail,
        reason: notifyRequest.reason,
      });
    } catch (err) {
      console.error('Failed to send email-change-request notice:', err);
    }
  }

  const fresh = (await ref.get()).data() || {};
  const req = fresh.emailChangeRequest as
    | { newEmail?: string; reason?: string; status?: string }
    | undefined;
  return NextResponse.json({
    ok: true,
    phone: fresh.phone ?? null,
    emailChangeRequest: req
      ? { newEmail: req.newEmail ?? '', reason: req.reason ?? '', status: req.status ?? 'pending' }
      : null,
  });
}
