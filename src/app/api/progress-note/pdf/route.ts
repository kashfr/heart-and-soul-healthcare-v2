import { renderNotePdf, notePdfFilename } from '@/lib/notePdfServer';
import type { ProgressNoteFormData } from '@/lib/pdf/ProgressNotePDF';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const data: ProgressNoteFormData = await request.json();

    // When a saved note id is supplied (?id=), the audit trail is appended so
    // post-submission amendments travel with the export. It is read
    // server-side by id, so authorize the caller before disclosing it: any
    // active staff member, and a nurse only for her own note (mirrors the
    // in-app "staff see any, author sees own" policy). Requests without an id
    // (unsaved previews) read no server data and remain open.
    const noteId = new URL(request.url).searchParams.get('id');
    if (noteId) {
      const caller = await requireRole(request, ['admin', 'supervisor', 'nurse']);
      if (caller.role === 'nurse') {
        const noteSnap = await adminDb().collection('progressNotes').doc(noteId).get();
        if (!noteSnap.exists || noteSnap.data()?.nurseId !== caller.uid) {
          throw new AdminAuthError(403, 'You can only export the audit trail for your own notes.');
        }
      }
    }
    const buffer = await renderNotePdf(data, noteId);
    const filename = notePdfFilename(data);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.error('PDF generation error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
