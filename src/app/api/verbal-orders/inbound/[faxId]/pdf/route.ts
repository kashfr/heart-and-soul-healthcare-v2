import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { srfaxRetrieveInbound } from '@/lib/fax/srfax';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Preview an inbound fax the sweep recorded, so the office can see what it
 *  is before matching it to an order. Staff only; the fax stays unread in
 *  SRFax (marking happens when it is filed). */
export async function GET(request: Request, { params }: { params: Promise<{ faxId: string }> }) {
  try {
    await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { faxId } = await params;
  if (!/^[0-9]{1,20}$/.test(faxId)) return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  const snap = await adminDb().collection('verbalOrderInbound').doc(faxId).get();
  const fileName = String((snap.data() || {}).fileName || '');
  if (!snap.exists || !fileName) return NextResponse.json({ error: 'Fax not found.' }, { status: 404 });
  const got = await srfaxRetrieveInbound(fileName, false);
  if (!got.ok || !got.pdf) return NextResponse.json({ error: got.error || 'Could not download the fax.' }, { status: 502 });
  return new Response(new Uint8Array(got.pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Inbound_Fax_${faxId}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
