import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';

/**
 * POST /api/admin/in-progress/dup-decision
 *
 * Admin/supervisor approves or denies a nurse's request to submit a second
 * note for a client she's already documented on that date. The request lives
 * on the nurse's draft (noteDrafts/{nurseId}); the draft security rules block
 * staff from writing another user's draft, so this privileged write goes
 * through the Admin SDK.
 *
 * Body: { nurseId: string, decision: 'approve' | 'deny', denyNote?: string }
 */
interface Body {
  nurseId?: string;
  decision?: 'approve' | 'deny';
  denyNote?: string;
}

export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
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

  const nurseId = (body.nurseId || '').trim();
  const decision = body.decision;
  const denyNote = (body.denyNote || '').trim();

  if (!nurseId) return NextResponse.json({ error: 'nurseId is required.' }, { status: 400 });
  if (decision !== 'approve' && decision !== 'deny') {
    return NextResponse.json({ error: "decision must be 'approve' or 'deny'." }, { status: 400 });
  }

  const ref = adminDb().collection('noteDrafts').doc(nurseId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'That nurse no longer has a draft in progress.' }, { status: 404 });
  }
  const dup = snap.data()?.dupRequest;
  if (!dup || dup.status !== 'pending') {
    return NextResponse.json(
      { error: 'There is no pending duplicate request for this nurse (it may have been resolved already).' },
      { status: 409 }
    );
  }

  const decidedByName = caller.profile?.displayName || caller.email || 'A reviewer';
  const update: Record<string, unknown> = {
    'dupRequest.status': decision === 'approve' ? 'approved' : 'denied',
    'dupRequest.decidedBy': caller.uid,
    'dupRequest.decidedByName': decidedByName,
    'dupRequest.decidedAt': FieldValue.serverTimestamp(),
  };
  if (decision === 'deny') {
    update['dupRequest.denyNote'] = denyNote;
  }
  await ref.update(update);

  return NextResponse.json({
    ok: true,
    nurseId,
    status: decision === 'approve' ? 'approved' : 'denied',
    decidedByName,
  });
}
