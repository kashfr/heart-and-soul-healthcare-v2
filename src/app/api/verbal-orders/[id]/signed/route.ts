import { NextResponse } from 'next/server';
import { requireRole, AdminAuthError } from '@/lib/adminAuthGuard';
import { getVerbalOrder, recordVerbalOrderSigned } from '@/lib/verbalOrderServer';
import { srfaxRetrieveInbound } from '@/lib/fax/srfax';
import { adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 25_000_000;

/**
 * POST /api/verbal-orders/[id]/signed
 *   { signedDate, physicianPrintedName?, signedPdfBase64?, inboundFaxFileName? }
 *
 * The office closes the loop by hand: a signed copy came back on paper or by
 * email, or an unmatched inbound fax on the queue is this order's signature.
 * Staff only. Files the copy under the client's Documents and stamps the MAR
 * order's signed date.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let caller;
  try {
    caller = await requireRole(request, ['admin', 'supervisor']);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'File too large.' }, { status: 413 });
  }
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const signedDate = String(body.signedDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedDate)) return NextResponse.json({ error: 'signedDate must be YYYY-MM-DD.' }, { status: 400 });
  const order = await getVerbalOrder(id);
  if (!order) return NextResponse.json({ error: 'Verbal order not found.' }, { status: 404 });
  if (signedDate < order.takenDate) return NextResponse.json({ error: 'The signed date cannot be before the order was taken.' }, { status: 400 });

  let signedPdf: Buffer | undefined;
  let inboundFaxFileName = '';
  const b64 = String(body.signedPdfBase64 || '');
  if (b64) {
    signedPdf = Buffer.from(b64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
    if (signedPdf.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ error: 'The signed copy must be a PDF.' }, { status: 400 });
  } else if (String(body.inboundFaxFileName || '')) {
    inboundFaxFileName = String(body.inboundFaxFileName);
    // Only a fax the sweep recorded (and hasn't filed) may be attached, so
    // an arbitrary SRFax file name can't be filed under a client.
    const faxKey = inboundFaxFileName.includes('|') ? inboundFaxFileName.split('|').pop() || '' : '';
    const known = faxKey ? await adminDb().collection('verbalOrderInbound').doc(faxKey).get() : null;
    const knownStatus = known?.exists ? String((known.data() || {}).status || '') : '';
    if (!known?.exists || String((known.data() || {}).fileName || '') !== inboundFaxFileName || !['unmatched', 'suggested'].includes(knownStatus)) {
      return NextResponse.json({ error: 'That fax is not waiting to be matched.' }, { status: 400 });
    }
    const got = await srfaxRetrieveInbound(inboundFaxFileName, true);
    if (!got.ok || !got.pdf) return NextResponse.json({ error: got.error || 'Could not download that fax.' }, { status: 502 });
    signedPdf = got.pdf;
  }

  const result = await recordVerbalOrderSigned({
    orderId: id,
    method: inboundFaxFileName ? 'fax' : 'manual',
    signedDate,
    physicianPrintedName: String(body.physicianPrintedName || ''),
    receivedBy: { uid: caller.uid, name: caller.profile.displayName || caller.email || '' },
    signedPdf,
    inboundFaxFileName,
  });
  if (!result.ok) return NextResponse.json({ error: result.error || 'Could not record the signature.' }, { status: 500 });
  if (inboundFaxFileName) {
    const faxId = inboundFaxFileName.includes('|') ? inboundFaxFileName.split('|').pop() || '' : '';
    if (faxId) {
      await adminDb().collection('verbalOrderInbound').doc(faxId).set({ status: 'filed', matchedOrderId: id, filedAt: FieldValue.serverTimestamp(), filedBy: caller.uid }, { merge: true }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, alreadySigned: !!result.alreadySigned, documentId: result.documentId || '' });
}
