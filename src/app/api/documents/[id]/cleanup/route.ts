import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { cleanupReplacedFiles } from '@/lib/patientDocumentsServer';

/**
 * POST /api/documents/[id]/cleanup
 *
 * After a staff member replaces a document's file (client-side upload to a
 * new object + metadata update), remove the previous object(s) so a wrongly
 * uploaded file does not linger in the bucket. Staff only; best-effort.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    return NextResponse.json(await cleanupReplacedFiles(id));
  } catch (err) {
    console.error('document cleanup failed:', err);
    return NextResponse.json({ error: 'Cleanup failed.' }, { status: 500 });
  }
}
