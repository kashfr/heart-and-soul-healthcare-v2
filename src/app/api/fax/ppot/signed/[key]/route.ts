import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { readSignedPpotPdf } from '@/lib/ppotServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/fax/ppot/signed/[key]  the signed Appendix T filed for a request. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { key } = await params;
  if (!/^(referral|client)_[A-Za-z0-9_-]{1,128}$/.test(key)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const file = await readSignedPpotPdf(key);
  if (!file) return NextResponse.json({ error: 'No signed copy on file.' }, { status: 404 });
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
