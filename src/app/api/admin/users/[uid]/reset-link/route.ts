import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ uid: string }> }
) {
  const { uid } = await params;

  try {
    await requireRole(request, ['admin']);
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

  const resetLink = await adminAuth().generatePasswordResetLink(email);

  return NextResponse.json({
    uid,
    email,
    displayName: profile.displayName ?? null,
    role: profile.role ?? null,
    credential: profile.credential ?? null,
    resetLink,
  });
}
