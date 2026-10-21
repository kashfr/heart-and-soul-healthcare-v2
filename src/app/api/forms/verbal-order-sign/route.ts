import { NextResponse } from 'next/server';
import { lookupSignToken, markSignTokenUsed, recordVerbalOrderSigned, agencyTodayISO } from '@/lib/verbalOrderServer';
import { formatUSFaxNumber } from '@/lib/verbalOrderShared';
import { formatDateUS } from '@/lib/dateFormat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 1_500_000;

/**
 * Public physician e-sign. The token is a 24-byte random value printed on the
 * faxed form (link + QR); it's the only credential, so responses never carry
 * more than the physician needs to authenticate the order they were faxed.
 *
 * GET  ?t=  -> the order as the physician should see it (no nurse signature image).
 * POST { t, physicianPrintedName, signature } -> records the signature once.
 */
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') || '';
  const found = await lookupSignToken(t);
  if (!found) return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 });
  const { order, used, cancelled } = found;
  // A voided order: say so, and nothing else.
  if (cancelled && !used) {
    return NextResponse.json({ cancelled: true, order: { physicianName: order.physicianName, signedDate: '', patientName: '', patientDob: '', takenDate: '', nurseName: '', nurseCredential: '', physicianSpecialty: '', physicianFax: '', orderType: order.orderType, orderText: '' } }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  // Once signed, the link only confirms that: no PHI on a page that has
  // finished its job.
  if (used) {
    return NextResponse.json({ used: true, order: { signedDate: order.signed?.signedDate ? formatDateUS(order.signed.signedDate) : '', physicianName: order.physicianName, patientName: '', patientDob: '', takenDate: '', nurseName: '', nurseCredential: '', physicianSpecialty: '', physicianFax: '', orderType: order.orderType, orderText: '' } }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  return NextResponse.json({
    used,
    order: {
      patientName: order.patientName,
      patientDob: formatDateUS(order.patientDob),
      takenDate: formatDateUS(order.takenDate),
      nurseName: order.nurseName,
      nurseCredential: order.nurseCredential,
      physicianName: order.physicianName,
      physicianSpecialty: order.physicianSpecialty,
      physicianFax: formatUSFaxNumber(order.physicianFax),
      orderType: order.orderType,
      orderText: order.orderText,
      signedDate: order.signed?.signedDate ? formatDateUS(order.signed.signedDate) : '',
    },
  }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true }); // honeypot
  const t = String(body.t || '');
  const printedName = String(body.physicianPrintedName || '').trim();
  const signature = String(body.signature || '');
  const attest = body.attest === true;
  if (!printedName) return NextResponse.json({ error: 'Please type your name as it should appear on the order.' }, { status: 400 });
  if (!signature.startsWith('data:image/png;base64,') || signature.length < 200) return NextResponse.json({ error: 'Please sign in the box.' }, { status: 400 });
  if (!attest) return NextResponse.json({ error: 'Please confirm that you reviewed the order.' }, { status: 400 });

  const found = await lookupSignToken(t);
  if (!found) return NextResponse.json({ error: 'This signing link is not valid.' }, { status: 404 });
  if (found.used) return NextResponse.json({ error: 'This order has already been signed.' }, { status: 409 });
  if (found.cancelled) return NextResponse.json({ error: 'Heart and Soul Healthcare cancelled this order. No signature is needed.' }, { status: 409 });

  const r = await recordVerbalOrderSigned({
    orderId: found.order.id,
    method: 'esign',
    signedDate: agencyTodayISO(),
    physicianPrintedName: printedName,
    physicianSignature: signature,
    receivedBy: { uid: '', name: 'Physician (signed online)' },
  });
  if (r.cancelled) return NextResponse.json({ error: 'Heart and Soul Healthcare cancelled this order. No signature is needed.' }, { status: 409 });
  if (!r.ok) return NextResponse.json({ error: r.error || 'We could not record your signature. Please fax the signed form instead.' }, { status: 500 });
  await markSignTokenUsed(t);
  return NextResponse.json({ ok: true });
}
