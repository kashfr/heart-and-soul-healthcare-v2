import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { readReferralDocument } from '@/lib/referralDocumentsServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/referrals/[id]/documents/[docId]/pdf  one filed paper. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    await requireRole(request, ['admin', 'supervisor', 'va']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id, docId } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(docId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const file = await readReferralDocument(id, docId);
  if (!file) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
