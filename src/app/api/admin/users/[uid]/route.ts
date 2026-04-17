import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import type { Role } from '@/lib/auth';

const VALID_ROLES: Role[] = ['admin', 'supervisor', 'nurse'];

interface PatchBody {
  displayName?: string;
  credential?: string;
  role?: Role;
  active?: boolean;
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
    caller = await requireRole(request, ['admin']);
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

  const update: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    const trimmed = body.displayName.trim();
    if (!trimmed) return badRequest('displayName cannot be empty.');
    update.displayName = trimmed;
  }

  if (body.credential !== undefined) {
    update.credential = body.credential.trim();
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

  if (Object.keys(update).length === 0) {
    return badRequest('No updatable fields supplied.');
  }

  const ref = adminDb().collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  update.updatedAt = FieldValue.serverTimestamp();
  update.updatedBy = caller.uid;

  await ref.update(update);

  // Keep Firebase Auth displayName in sync + handle disable/enable + force
  // signout of active sessions when deactivating.
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

  const fresh = (await ref.get()).data() || {};
  return NextResponse.json({
    uid,
    email: fresh.email ?? null,
    displayName: fresh.displayName ?? null,
    role: fresh.role ?? null,
    credential: fresh.credential ?? null,
    active: fresh.active !== false,
  });
}
