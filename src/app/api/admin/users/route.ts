import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseAuthError } from 'firebase-admin/auth';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import type { Role } from '@/lib/auth';
import { sendStaffInvite } from '@/lib/emails/staffInvite';

interface CreateUserBody {
  displayName: string;
  email: string;
  role: Role;
  credential?: string;
}

const VALID_ROLES: Role[] = ['admin', 'supervisor', 'nurse'];

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  // Admins + supervisors can create staff accounts. Supervisors cannot create
  // admin accounts (we enforce that after parsing the body).
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body: CreateUserBody;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON body.');
  }

  const displayName = (body.displayName || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const role = body.role;
  const credential = (body.credential || '').trim();

  if (!displayName) return badRequest('displayName is required.');
  if (!email || !/.+@.+\..+/.test(email)) return badRequest('A valid email is required.');
  if (!VALID_ROLES.includes(role)) return badRequest('role must be admin, supervisor, or nurse.');
  if (role === 'nurse' && !credential) {
    return badRequest('credential is required for nurses.');
  }
  if (caller.role === 'supervisor' && role === 'admin') {
    return NextResponse.json(
      { error: 'Supervisors cannot create admin accounts.' },
      { status: 403 }
    );
  }

  // Create the Firebase Auth user. A random password is set so the account
  // technically exists; the invitee will replace it via the reset link we
  // return below.
  const randomPassword = crypto.randomUUID() + crypto.randomUUID();

  let userRecord;
  try {
    userRecord = await adminAuth().createUser({
      email,
      password: randomPassword,
      displayName,
      emailVerified: false,
      disabled: false,
    });
  } catch (err) {
    if (err instanceof FirebaseAuthError && err.code === 'auth/email-already-exists') {
      return NextResponse.json(
        { error: `An account with email ${email} already exists.` },
        { status: 409 }
      );
    }
    throw err;
  }

  // Seed the Firestore user profile. Admin SDK bypasses security rules.
  const profile = {
    uid: userRecord.uid,
    email,
    displayName,
    role,
    ...(credential ? { credential } : {}),
    active: true,
    invitedBy: caller.uid,
    createdAt: FieldValue.serverTimestamp(),
  };
  await adminDb().collection('users').doc(userRecord.uid).set(profile);

  // Claim orphan progress notes submitted under this nurse's name.
  // We scan in memory and match on trimmed + lowercased nurseName so small
  // data-entry drift (trailing spaces, stray capitalization) doesn't cause
  // silent misses like it did for our first batch of nurses. When we claim a
  // note we also rewrite q11_nurseName to the normalized profile displayName,
  // so subsequent queries stay clean. This is O(N) over progressNotes — fine
  // for our current volume; revisit with a normalized lookup field if the
  // collection grows past a few thousand.
  const normalizedTarget = displayName.trim().toLowerCase();
  const allNotes = await adminDb().collection('progressNotes').get();
  const toClaim = allNotes.docs.filter((d) => {
    const data = d.data();
    if (data.nurseId) return false;
    const stored = (data.q11_nurseName || '').trim().toLowerCase();
    return stored !== '' && stored === normalizedTarget;
  });
  if (toClaim.length > 0) {
    const batch = adminDb().batch();
    for (const d of toClaim) {
      batch.update(d.ref, {
        nurseId: userRecord.uid,
        q11_nurseName: displayName,
        claimedAt: FieldValue.serverTimestamp(),
        claimedBy: caller.uid,
      });
    }
    await batch.commit();
  }

  // Generate a password-reset link so the new user can set their own password.
  // The link opens Firebase's hosted reset page for this project.
  const resetLink = await adminAuth().generatePasswordResetLink(email);

  // Send the invitation email automatically via Resend. We return the
  // outcome (and keep the resetLink in the payload) so the caller can fall
  // back to "copy link + paste in mail client" if Resend rejects the send.
  const emailResult = await sendStaffInvite({
    to: email,
    displayName,
    role,
    resetLink,
    isResend: false,
  });

  return NextResponse.json({
    uid: userRecord.uid,
    email,
    displayName,
    role,
    credential: credential || null,
    resetLink,
    orphansClaimed: toClaim.length,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
  });
}

export async function GET(request: Request) {
  // Staff list is visible to admins + supervisors — they both manage staff.
  try {
    await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Not using orderBy on createdAt so docs without that field (e.g. the
  // manually-bootstrapped first admin) still show up. Sort client-side.
  const snap = await adminDb().collection('users').get();
  const users = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toMillis?.() ?? null;
    return {
      uid: d.id,
      email: data.email ?? null,
      displayName: data.displayName ?? null,
      role: data.role ?? null,
      credential: data.credential ?? null,
      active: data.active !== false,
      createdAt,
    };
  });
  users.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return NextResponse.json({ users });
}
