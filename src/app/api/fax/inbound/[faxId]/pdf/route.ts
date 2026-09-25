import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { readIncomingFaxPdf } from '@/lib/ppotServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/fax/inbound/[faxId]/pdf  preview an unfiled inbound fax (it stays unread in SRFax). */
export async function GET(request: Request, { params }: { params: Promise<{ faxId: string }> }) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { faxId } = await params;
  if (!/^[0-9]{1,20}$/.test(faxId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const got = await readIncomingFaxPdf(faxId);
  if (!got.ok || !got.pdf) return NextResponse.json({ error: got.error }, { status: got.status || 500 });
  return new Response(new Uint8Array(got.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Inbound_Fax_${faxId}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
