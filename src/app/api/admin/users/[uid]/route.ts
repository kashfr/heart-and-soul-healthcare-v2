import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAuthError } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { sendEmailChangedNotice } from '@/lib/emails/emailChanged';
import type { Role } from '@/lib/auth';
import { formatUSPhone, isValidUSPhone, phoneDigits } from '@/lib/phone';

const VALID_ROLES: Role[] = ['admin', 'supervisor', 'nurse'];

// Lightweight RFC-5322-ish format check. Firebase Auth does stricter
// validation server-side; this just catches obvious typos before the call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PatchBody {
  displayName?: string;
  credential?: string;
  role?: Role;
  active?: boolean;
  email?: string;
  phone?: string;
  /** Dismiss a pending self-service email-change request without applying it. */
  clearEmailRequest?: boolean;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;

  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body.');
  }

  // Supervisors cannot touch admin accounts at all (edit, role-change,
  // deactivate) and cannot promote anyone to admin. Admins can do anything.
  const ref = adminDb().collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }
  const targetRole = snap.data()?.role as Role | undefined;

  if (caller.role === 'supervisor') {
    if (targetRole === 'admin') {
      return forbidden('Supervisors cannot modify admin accounts.');
    }
    if (body.role === 'admin') {
      return forbidden('Supervisors cannot promote users to admin.');
    }
  }

  const update: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    const trimmed = body.displayName.trim();
    if (!trimmed) return badRequest('displayName cannot be empty.');
    update.displayName = trimmed;
  }

  if (body.credential !== undefined) {
    update.credential = body.credential.trim();
  }

  // Phone is optional and clearable. An empty string removes it; a non-empty
  // value must be a complete US number and is stored normalized.
  if (body.phone !== undefined) {
    const trimmed = body.phone.trim();
    if (trimmed && !isValidUSPhone(trimmed)) {
      return badRequest('Phone number must be a 10-digit US number.');
    }
    update.phone = trimmed ? formatUSPhone(phoneDigits(trimmed)) : '';
  }

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) return badRequest('Invalid role.');
    if (uid === caller.uid) {
      return forbidden('You cannot change your own role.');
    }
    update.role = body.role;
  }

  if (body.active !== undefined) {
    if (uid === caller.uid && body.active === false) {
      return forbidden('You cannot deactivate your own account.');
    }
    update.active = body.active;
  }

  // Email change: validate, normalize, and detect whether it actually
  // differs from what's on file. The Firebase Auth update + old-address
  // notification happen later, after the Firestore write succeeds.
  const previousEmail = (snap.data()?.email as string | undefined) ?? null;
  let normalizedNewEmail: string | null = null;
  if (body.email !== undefined) {
    // Preserve the exact case the admin typed. Email is case-insensitive for
    // sign-in (Firebase enforces uniqueness case-insensitively), so we only
    // lowercase for the "did it actually change?" comparison.
    const trimmed = body.email.trim();
    if (!trimmed) return badRequest('Email cannot be empty.');
    if (!EMAIL_RE.test(trimmed)) return badRequest('That doesn\'t look like a valid email address.');
    if (trimmed.toLowerCase() !== (previousEmail || '').toLowerCase()) {
      normalizedNewEmail = trimmed;
      update.email = trimmed;
    }
  }

  // Applying an email (approving a request) or an explicit dismiss both clear
  // any pending self-service email-change request on the doc.
  if (normalizedNewEmail || body.clearEmailRequest) {
    update.emailChangeRequest = FieldValue.delete();
  }

  if (Object.keys(update).length === 0) {
    return badRequest('No updatable fields supplied.');
  }

  update.updatedAt = FieldValue.serverTimestamp();
  update.updatedBy = caller.uid;

  // Email change goes through Firebase Auth FIRST so collisions
  // ("email-already-in-use") bail out before we touch Firestore. Setting
  // emailVerified:false matches Firebase's own behavior on email change —
  // the new address starts unverified, which is the safe default.
  if (normalizedNewEmail) {
    try {
      await adminAuth().updateUser(uid, {
        email: normalizedNewEmail,
        emailVerified: false,
      });
    } catch (err) {
      if (err instanceof FirebaseAuthError) {
        if (err.code === 'auth/email-already-exists' || err.code === 'auth/email-already-in-use') {
          return NextResponse.json(
            { error: 'Another account already uses that email address.' },
            { status: 409 }
          );
        }
        if (err.code === 'auth/invalid-email') {
          return badRequest('That email address was rejected as invalid.');
        }
      }
      console.error('Firebase Auth email update failed:', err);
      return NextResponse.json(
        { error: 'Could not update the email address. Please try again.' },
        { status: 500 }
      );
    }
  }

  await ref.update(update);

  // Keep Firebase Auth displayName in sync + handle disable/enable + force
  // signout of active sessions when deactivating. Email is handled above.
  const authUpdate: { displayName?: string; disabled?: boolean } = {};
  if (body.displayName !== undefined) authUpdate.displayName = update.displayName as string;
  if (body.active !== undefined) authUpdate.disabled = body.active === false;
  if (Object.keys(authUpdate).length > 0) {
    await adminAuth().updateUser(uid, authUpdate);
  }
  if (body.active === false) {
    // Force any open sessions to re-auth; combined with disabled:true, they
    // won't be able to sign back in.
    await adminAuth().revokeRefreshTokens(uid);
  }

  // Best-effort security notification to the OLD address. Non-fatal: the
  // change has already succeeded, the user just won't get the heads-up
  // email. We swallow the result here (logged inside the helper) so a
  // Resend hiccup doesn't fail the whole request.
  if (normalizedNewEmail && previousEmail) {
    const targetName =
      (snap.data()?.displayName as string | undefined) || previousEmail;
    void sendEmailChangedNotice({
      to: previousEmail,
      displayName: targetName,
      newEmail: normalizedNewEmail,
      changedByName: caller.profile.displayName || caller.email || 'an administrator',
    });
  }

  const fresh = (await ref.get()).data() || {};
  const freshEcr = fresh.emailChangeRequest as
    | { newEmail?: string; reason?: string; status?: string }
    | undefined;
  return NextResponse.json({
    uid,
    email: fresh.email ?? null,
    displayName: fresh.displayName ?? null,
    role: fresh.role ?? null,
    credential: fresh.credential ?? null,
    phone: fresh.phone ?? null,
    active: fresh.active !== false,
    emailChangeRequest:
      freshEcr && freshEcr.status === 'pending' && freshEcr.newEmail
        ? { newEmail: freshEcr.newEmail, reason: freshEcr.reason ?? '', status: 'pending' as const }
        : null,
  });
}
