import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { moveDocumentToPatient } from '@/lib/patientDocumentsServer';

/**
 * POST /api/documents/[id]/move  { toPatientId, title?, docDate?, category? }
 *
 * Move a document that was uploaded to the wrong client. Admin only:
 * copy-then-delete under the hood (Storage paths embed the client and
 * patientId is immutable in rules), with the original deletion audited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let caller;
  try {
    caller = await requireRole(request, ['admin']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = (await request.json().catch(() => ({}))) as { toPatientId?: string; title?: string; docDate?: string; category?: string };
  const toPatientId = String(body.toPatientId || '').trim();
  if (!toPatientId) return NextResponse.json({ error: 'toPatientId is required.' }, { status: 400 });
  try {
    const result = await moveDocumentToPatient(id, toPatientId, caller, { title: body.title, docDate: body.docDate, category: body.category });
    if (!result.ok) {
      const status = result.reason === 'not-found' || result.reason === 'no-target' ? 404 : 409;
      return NextResponse.json({ error: result.message, reason: result.reason }, { status });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('document move failed:', err);
    return NextResponse.json({ error: 'Could not move the document.' }, { status: 500 });
  }
}
