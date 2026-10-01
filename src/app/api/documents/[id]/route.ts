import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { deleteDocumentWithAudit, updateDocumentDetailsServer } from '@/lib/patientDocumentsServer';

/**
 * DELETE /api/documents/[id]
 *
 * Permanently delete a client document (file + metadata). Admin only. The
 * metadata is snapshotted into deletedDocuments first so the deletion stays
 * forensically recoverable. Rules deny client-side deletes; this privileged
 * route is the only path.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const result = await deleteDocumentWithAudit(id, caller);
  if (!result.ok) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/documents/[id]  { title, category, docDate }
 *
 * Staff edit a document's title, category, or date. Goes through the server
 * (not a rules-gated browser write) so an entry filed from a visit note can
 * be marked as edited by hand: re-filing the note then updates the PDF but
 * keeps the title, category and date as set here.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const result = await updateDocumentDetailsServer(id, {
    title: String(body.title ?? ''),
    category: String(body.category ?? ''),
    docDate: String(body.docDate ?? ''),
  }, caller);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
