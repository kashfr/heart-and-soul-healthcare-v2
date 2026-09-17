import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Dismiss an inbound fax that is not a signed verbal order (a welcome fax,
 *  a referral, junk). It leaves the queue; the fax itself stays in SRFax. */
export async function POST(request: Request, { params }: { params: Promise<{ faxId: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { faxId } = await params;
  if (!/^[0-9]{1,20}$/.test(faxId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const ref = adminDb().collection('verbalOrderInbound').doc(faxId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Fax not found.' }, { status: 404 });
  const status = String((snap.data() || {}).status || '');
  if (!['unmatched', 'suggested'].includes(status)) return NextResponse.json({ ok: true, alreadyHandled: true });
  await ref.update({ status: 'ignored', ignoredAt: FieldValue.serverTimestamp(), ignoredBy: caller.uid, ignoredByName: caller.profile.displayName || caller.email || '' });
  return NextResponse.json({ ok: true });
}
