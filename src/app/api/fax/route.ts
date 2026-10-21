import { prepareFaxAttachments, FaxAttachmentError } from '@/lib/faxAttachments';
import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { srfaxConfigured } from '@/lib/fax/srfax';
import { listOutboundFaxes, pollInFlightFaxes, requireFaxAccess, sendOutboundFax } from '@/lib/faxCenterServer';
import { returnFaxNumber } from '@/lib/verbalOrderServer';
import { FAX_MAX_PDF_BYTES, validateFaxSendInput, type FaxSendInput } from '@/lib/faxShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Base64 inflates by a third; leave room for the JSON around it.
const MAX_BODY_BYTES = Math.ceil(FAX_MAX_PDF_BYTES * 1.4) + 64_000;

/**
 * GET /api/fax   the outbox (newest 200) plus whether SRFax is configured.
 * POST /api/fax  { recipientName, recipientOrg, toNumber, confirmNumber,
 *                  regarding, note, includeCover, attachments: [{ fileName, pdfBase64 }] }
 *
 * Admins, and supervisors / the VA an admin granted in Settings.
 */
export async function GET(request: Request) {
  try {
    await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Pick up any delivery result a missed webhook didn't bring in, so the
  // outbox is current when someone is looking at it.
  if (srfaxConfigured()) await pollInFlightFaxes({ olderThanMs: 60_000, limit: 20 }).catch(() => null);
  const faxes = await listOutboundFaxes(200);
  return NextResponse.json({ faxes, configured: srfaxConfigured(), returnFax: await returnFaxNumber() });
}

export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Keep all attachments together under 10 MB.', fields: { file: 'Keep all attachments together under 10 MB.' } }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return NextResponse.json({ error: 'Keep all attachments together under 10 MB.' }, { status: 413 }); }
      chunks.push(value);
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid body');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const input: FaxSendInput = {
    recipientName: String(body.recipientName || ''),
    recipientOrg: String(body.recipientOrg || ''),
    toNumber: String(body.toNumber || ''),
    confirmNumber: String(body.confirmNumber || ''),
    regarding: String(body.regarding || ''),
    note: String(body.note || ''),
    includeCover: body.includeCover !== false,
  };
  // Keep compatibility with older browser tabs that submit a single file.
  const attachments = body.attachments === undefined ? [{ fileName: body.fileName, pdfBase64: body.pdfBase64 }] : body.attachments;
  const fields = validateFaxSendInput(input, Array.isArray(attachments) && attachments.length > 0);
  if (Object.keys(fields).length > 0) return NextResponse.json({ error: Object.values(fields)[0], fields }, { status: 400 });
  let packet;
  try { packet = await prepareFaxAttachments(attachments, input.includeCover); }
  catch (err) {
    if (err instanceof FaxAttachmentError) return NextResponse.json({ error: err.message, fields: { file: err.message } }, { status: 400 });
    throw err;
  }
  const result = await sendOutboundFax({ input, ...packet, caller });
  if (!result.ok) {
    const fields = result.status === 400 ? { file: result.error } : undefined;
    return NextResponse.json({ error: result.error, fax: result.fax, fields }, { status: result.status || 500 });
  }
  return NextResponse.json({ ok: true, fax: result.fax });
}
