import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { deleteDocumentWithAudit } from '@/lib/patientDocumentsServer';

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
