import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { fileNoteAsDocument } from '@/lib/patientDocumentsServer';

/**
 * POST /api/documents/file-note  { noteId }
 *
 * Render a submitted RN oversight visit note or home supervisory visit to
 * PDF and file it under the client's Documents tab, replacing an earlier
 * filing of the same note. Called by the note forms right after submit and
 * after an amendment, and by the Documents tab's "Refresh PDF" button.
 * Author or staff only.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = (await request.json().catch(() => ({}))) as { noteId?: string };
  const noteId = String(body.noteId || '').trim();
  if (!noteId) return NextResponse.json({ error: 'noteId is required.' }, { status: 400 });
  try {
    const result = await fileNoteAsDocument(noteId, caller);
    if (!result.ok) {
      const status = result.reason === 'not-found' ? 404 : result.reason === 'forbidden' ? 403 : 409;
      return NextResponse.json({ error: result.message, reason: result.reason }, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('file-note failed:', err);
    return NextResponse.json({ error: 'Could not file the note as a document.' }, { status: 500 });
  }
}
