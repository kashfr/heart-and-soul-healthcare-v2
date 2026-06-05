import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';

/**
 * Audit log for admin "View as" sessions. Admin-only. Each start of a view-as
 * session writes one record so there's a trail that an admin viewed a staff
 * member's account (read-only). The actual rendering-as-nurse happens entirely
 * client-side; this endpoint exists only to record the access.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const targetUid = String(body?.targetUid || '').trim();
  const targetName = String(body?.targetName || '').trim();
  if (!targetUid) {
    return NextResponse.json({ error: 'targetUid is required.' }, { status: 400 });
  }
  // An admin can't view-as themselves (pointless) — guard anyway.
  if (targetUid === caller.uid) {
    return NextResponse.json({ error: 'Cannot view as yourself.' }, { status: 400 });
  }

  await adminDb().collection('viewAsLog').add({
    adminUid: caller.uid,
    adminName: caller.profile.displayName || caller.email || '',
    targetUid,
    targetName,
    at: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
