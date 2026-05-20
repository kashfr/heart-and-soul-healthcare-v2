import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { cosignNote } from '@/lib/cosignServer';

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_BYTES = 256 * 1024;
const MAX_BATCH = 50; // matches the existing batch-export cap

export async function POST(request: Request) {
  let caller;
  try {
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

  const noteIds: unknown = body?.noteIds;
  const signature = String(body?.signature || '');

  if (!Array.isArray(noteIds) || noteIds.length === 0) {
    return NextResponse.json({ error: 'noteIds must be a non-empty array.' }, { status: 400 });
  }
  if (noteIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Cannot co-sign more than ${MAX_BATCH} notes at a time.` },
      { status: 400 }
    );
  }
  if (!noteIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return NextResponse.json({ error: 'noteIds must be strings.' }, { status: 400 });
  }
  if (!signature) {
    return NextResponse.json({ error: 'Signature is required.' }, { status: 400 });
  }
  if (!DATA_URL_RE.test(signature)) {
    return NextResponse.json({ error: 'Signature must be a base64 image data URL.' }, { status: 400 });
  }
  if (signature.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: 'Signature image is too large.' }, { status: 413 });
  }

  // Process serially so the same RN can't race herself into double-cosigning
  // the same note via concurrent calls (the per-note `already-cosigned` check
  // is at read-time, so a parallel pass through the same id could slip).
  const succeeded: string[] = [];
  const failed: { id: string; reason: string; message: string }[] = [];
  for (const id of noteIds as string[]) {
    const result = await cosignNote(id, caller, signature);
    if (result.ok) {
      succeeded.push(result.noteId);
    } else {
      failed.push({ id: result.noteId, reason: result.reason, message: result.message });
    }
  }

  return NextResponse.json({ succeeded, failed });
}
