import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { sendStaffInvite, type StaffInviteRole } from '@/lib/emails/staffInvite';

export async function POST(
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

  const snap = await adminDb().collection('users').doc(uid).get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }
  const profile = snap.data() || {};
  const email = profile.email;
  if (!email) {
    return NextResponse.json({ error: 'User has no email on file.' }, { status: 400 });
  }

  // Supervisors cannot reset password links for admin accounts.
  if (caller.role === 'supervisor' && profile.role === 'admin') {
    return NextResponse.json(
      { error: 'Supervisors cannot generate reset links for admin accounts.' },
      { status: 403 }
    );
  }

  const resetLink = await adminAuth().generatePasswordResetLink(email);

  // Auto-send the fresh link to the user so the admin doesn't have to copy +
  // paste. The resetLink is still returned in the payload as a copy-paste
  // fallback in case Resend can't deliver.
  const emailResult = await sendStaffInvite({
    to: email,
    displayName: profile.displayName || email,
    role: (profile.role as StaffInviteRole) || 'nurse',
    resetLink,
    isResend: true,
  });

  return NextResponse.json({
    uid,
    email,
    displayName: profile.displayName ?? null,
    role: profile.role ?? null,
    credential: profile.credential ?? null,
    resetLink,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
  });
}
