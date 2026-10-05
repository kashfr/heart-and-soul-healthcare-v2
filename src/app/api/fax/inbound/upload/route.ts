import { NextResponse } from 'next/server';
import { AdminAuthError } from '@/lib/adminAuthGuard';
import { requireFaxAccess } from '@/lib/faxCenterServer';
import { addUploadedInboundFax } from '@/lib/ppotServer';
import { agencyTodayISO } from '@/lib/verbalOrderServer';
import { normalizeUSFaxNumber } from '@/lib/verbalOrderShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A whole medical record can come back on a release; 20 MB matches Documents. */
export const UPLOADED_FAX_MAX_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil(UPLOADED_FAX_MAX_BYTES * 1.4) + 16_000;
const TOO_BIG = 'That file is too large. Keep it under 20 MB.';

/**
 * POST /api/fax/inbound/upload  { pdfBase64, fromNumber?, receivedDate, note? }
 * Add a fax that arrived somewhere other than the portal line (another fax
 * number, paper) to Incoming Faxes so it can be filed like the rest.
 */
export async function POST(request: Request) {
  let caller;
  try {
    caller = await requireFaxAccess(request);
  } catch (err) {
    if (err instanceof AdminAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const fromRaw = String(body.fromNumber || '').trim();
  if (fromRaw && !normalizeUSFaxNumber(fromRaw)) return NextResponse.json({ error: 'Enter the sender\'s 10-digit fax number, or leave it blank.', fields: { fromNumber: 'Enter a 10-digit fax number, or leave it blank.' } }, { status: 400 });
  const receivedDate = String(body.receivedDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || Number.isNaN(Date.parse(`${receivedDate}T00:00:00Z`)) || receivedDate > agencyTodayISO()) {
    return NextResponse.json({ error: 'Enter the date the fax was received (today or earlier).', fields: { receivedDate: 'Enter the date it was received.' } }, { status: 400 });
  }
  const b64 = String(body.pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '');
  if (!b64) return NextResponse.json({ error: 'Choose the fax PDF.', fields: { file: 'Choose the fax PDF.' } }, { status: 400 });
  const pdf = Buffer.from(b64, 'base64');
  if (pdf.length > UPLOADED_FAX_MAX_BYTES) return NextResponse.json({ error: TOO_BIG, fields: { file: TOO_BIG } }, { status: 413 });
  const result = await addUploadedInboundFax({ pdf, fromNumber: fromRaw, receivedDate, note: String(body.note || ''), caller });
  if (!result.ok) return NextResponse.json({ error: result.error, fields: { file: result.error } }, { status: result.status || 500 });
  return NextResponse.json({ ok: true, id: result.id, pages: result.pages, suggested: result.suggested });
}
