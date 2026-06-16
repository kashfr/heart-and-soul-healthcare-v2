import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { sendStaffInvite } from '@/lib/emails/staffInvite';
import { toAppResetLink } from '@/lib/resetLink';

/**
 * POST /api/auth/forgot-password   (public, unauthenticated)
 *
 * Self-service password reset triggered from the login page's "Forgot
 * password?" link. We generate the reset link server-side, route it through our
 * branded /reset-password page (via toAppResetLink), and send it with our own
 * Resend email — the same path the admin "resend link" flow uses. This replaces
 * the client `sendPasswordResetEmail`, whose email pointed at Firebase's default
 * hosted page (where nurses got stranded with no way back to sign in).
 *
 * Enumeration-safe: we ALWAYS respond { ok: true } whether or not an account
 * exists (the only non-OK response is a malformed email). A reset link can only
 * ever land in the real account owner's inbox.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const email = (body.email || '').trim();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  try {
    // Look up the account (also confirms it exists) for the greeting name.
    const userRecord = await adminAuth().getUserByEmail(email);
    const resetLink = toAppResetLink(await adminAuth().generatePasswordResetLink(email));
    await sendStaffInvite({
      to: email,
      displayName: userRecord.displayName || email,
      role: 'nurse', // role isn't used in the resend email body
      resetLink,
      isResend: true,
    });
  } catch {
    // user-not-found or any other hiccup: swallow it. We never reveal whether
    // the address has an account, and a failed send isn't worth surfacing.
  }

  return NextResponse.json({ ok: true });
}
