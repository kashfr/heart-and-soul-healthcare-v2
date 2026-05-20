import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { cosignNote } from '@/lib/cosignServer';

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/** Reasonable upper bound on a 200x75 PNG signature. Anything larger is suspicious. */
const MAX_SIGNATURE_BYTES = 256 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let caller;
  try {
    // We allow all three roles to *hit* the endpoint, then gate on credential
    // below. The credential check is the real authorization for co-sign.
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (caller.profile.credential !== 'RN') {
    return NextResponse.json(
      { error: 'Only Registered Nurses (RN) can co-sign progress notes.' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const signature = String(body?.signature || '');
  if (!signature) {
    return NextResponse.json({ error: 'Signature is required.' }, { status: 400 });
  }
  if (!DATA_URL_RE.test(signature)) {
    return NextResponse.json({ error: 'Signature must be a base64 image data URL.' }, { status: 400 });
  }
  if (signature.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: 'Signature image is too large.' }, { status: 413 });
  }

  const result = await cosignNote(id, caller, signature);
  if (!result.ok) {
    const status = result.reason === 'not-found' ? 404 : 409;
    return NextResponse.json({ error: result.message, reason: result.reason }, { status });
  }

  return NextResponse.json({ noteId: result.noteId, ok: true });
}
