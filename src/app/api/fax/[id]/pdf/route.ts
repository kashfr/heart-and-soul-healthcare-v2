import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { readOutboundFaxPdf, requireFaxAccess } from '@/lib/faxCenterServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/fax/[id]/pdf  the exact PDF that was faxed (cover included). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  const file = await readOutboundFaxPdf(id);
  if (!file) return NextResponse.json({ error: 'Fax not found.' }, { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
